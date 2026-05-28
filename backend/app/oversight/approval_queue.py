"""Blocking approval queue.

When the risk scorer returns HIGH, the agent loop calls `wait_for_decision`
which awaits a `asyncio.Future`. The /approve REST endpoint resolves that
future, unblocking the agent. A timeout config (settings.approval_timeout_seconds)
defaults to deny on timeout so a stuck demo doesn't hang forever.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

from ..config import settings
from ..event_bus import bus
from ..protocol import (
    ApprovalRequired,
    ApprovalResolved,
    Decision,
    Event,
)

log = logging.getLogger(__name__)


@dataclass
class PendingApproval:
    session_id: str
    tool_use_id: str
    tool_name: str
    tool_input: dict[str, Any]
    risk_reason: str
    future: asyncio.Future[ApprovalResolved] = field(
        default_factory=lambda: asyncio.get_event_loop().create_future()
    )


class ApprovalQueue:
    """In-memory pending-approval registry."""

    def __init__(self) -> None:
        self._pending: dict[str, PendingApproval] = {}  # tool_use_id → record

    def list_for_session(self, session_id: str) -> list[PendingApproval]:
        return [p for p in self._pending.values() if p.session_id == session_id]

    async def submit_and_wait(
        self,
        session_id: str,
        tool_use_id: str,
        tool_name: str,
        tool_input: dict[str, Any],
        risk_reason: str,
        timeout_seconds: int | None = None,
    ) -> ApprovalResolved:
        """Submit a HIGH-risk call to the queue, publish the required event, await decision."""
        record = PendingApproval(
            session_id=session_id,
            tool_use_id=tool_use_id,
            tool_name=tool_name,
            tool_input=tool_input,
            risk_reason=risk_reason,
        )
        self._pending[tool_use_id] = record

        await bus.publish(
            Event.make(
                session_id=session_id,
                type_="oversight.approval_required",
                data=ApprovalRequired(
                    tool_use_id=tool_use_id,
                    tool_name=tool_name,
                    tool_input=tool_input,
                    risk_reason=risk_reason,
                ),
            )
        )

        timeout = timeout_seconds or settings.approval_timeout_seconds
        try:
            resolved = await asyncio.wait_for(record.future, timeout=timeout)
        except TimeoutError:
            log.warning(
                "approval timed out for tool_use_id=%s after %ds; defaulting to deny",
                tool_use_id,
                timeout,
            )
            resolved = ApprovalResolved(
                tool_use_id=tool_use_id,
                decision=Decision.DENY,
                by="timeout",
                note=f"No decision after {timeout}s.",
            )
        finally:
            self._pending.pop(tool_use_id, None)

        await bus.publish(
            Event.make(
                session_id=session_id,
                type_="oversight.approval_resolved",
                data=resolved,
            )
        )
        return resolved

    def resolve(
        self,
        tool_use_id: str,
        decision: Decision,
        note: str | None = None,
    ) -> bool:
        """Called from the /approve REST endpoint."""
        record = self._pending.get(tool_use_id)
        if not record:
            return False
        if record.future.done():
            return False
        record.future.set_result(
            ApprovalResolved(
                tool_use_id=tool_use_id,
                decision=decision,
                by="human",
                note=note,
            )
        )
        return True


queue = ApprovalQueue()
