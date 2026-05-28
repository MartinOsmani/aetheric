"""In-process async event bus, keyed by session_id.

Every event flowing across the system goes through here:
- Agent runtime publishes
- WebSocket subscribers drain
- Audit log subscribes once globally and appends to JSONL
- Approval queue uses the same bus to surface required-approvals and listens
  for `oversight.approval_resolved` to unblock the agent.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from collections.abc import AsyncIterator

from .protocol import Event

log = logging.getLogger(__name__)


class EventBus:
    """One Queue per session, plus a global tap for the audit log."""

    def __init__(self) -> None:
        # session_id → list of subscriber queues (multiple subscribers allowed)
        self._subs: dict[str, list[asyncio.Queue[Event]]] = defaultdict(list)
        # global audit tap — one queue that sees every event from every session
        self._audit_tap: asyncio.Queue[Event] = asyncio.Queue(maxsize=10_000)

    async def publish(self, event: Event) -> None:
        """Fan out to all session subscribers + audit tap."""
        for queue in list(self._subs.get(event.session_id, [])):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                log.warning("subscriber queue full for session=%s; dropping event", event.session_id)
        try:
            self._audit_tap.put_nowait(event)
        except asyncio.QueueFull:
            log.warning("audit tap full; dropping event id=%s", event.id)

    def subscribe(self, session_id: str) -> asyncio.Queue[Event]:
        q: asyncio.Queue[Event] = asyncio.Queue(maxsize=1000)
        self._subs[session_id].append(q)
        return q

    def unsubscribe(self, session_id: str, queue: asyncio.Queue[Event]) -> None:
        if queue in self._subs.get(session_id, []):
            self._subs[session_id].remove(queue)
        if not self._subs.get(session_id):
            self._subs.pop(session_id, None)

    async def drain(self, session_id: str) -> AsyncIterator[Event]:
        """Async iterator over events for one session. Caller is responsible for cleanup."""
        q = self.subscribe(session_id)
        try:
            while True:
                event = await q.get()
                yield event
        finally:
            self.unsubscribe(session_id, q)

    @property
    def audit_tap(self) -> asyncio.Queue[Event]:
        return self._audit_tap


# Module-level singleton — one bus for the whole backend process.
bus = EventBus()
