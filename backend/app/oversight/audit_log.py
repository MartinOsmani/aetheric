"""Append-only JSONL audit log.

One file per session, plus a global tap that mirrors every event across all
sessions to a single rolling file (`all.jsonl`). The per-session file is the
artifact we hand to judges as proof of verifiability; the global tap is the
backend's own observability surface.
"""

from __future__ import annotations

import logging
from pathlib import Path

from ..config import AUDIT_DIR
from ..event_bus import bus
from ..protocol import Event

log = logging.getLogger(__name__)


def _session_path(session_id: str) -> Path:
    safe = "".join(c for c in session_id if c.isalnum() or c in "-_")[:64] or "unknown"
    return AUDIT_DIR / f"session-{safe}.jsonl"


_global_path = AUDIT_DIR / "all.jsonl"


def append(event: Event) -> None:
    """Sync append — called from the agent loop and the audit-tap consumer.

    Writing JSONL lines is cheap enough to do synchronously; doing it through
    an executor would just add latency for no gain.
    """
    line = event.model_dump_json() + "\n"
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    for path in (_session_path(event.session_id), _global_path):
        with path.open("a", encoding="utf-8") as f:
            f.write(line)


async def audit_tap_consumer() -> None:
    """Background task: drain the global audit tap and persist."""
    log.info("audit-tap consumer started")
    while True:
        event = await bus.audit_tap.get()
        try:
            append(event)
        except Exception:
            log.exception("failed to append audit event id=%s", event.id)


def read_session(session_id: str, limit: int = 500) -> list[Event]:
    """Read back the audit log for one session — used by the /audit endpoint."""
    path = _session_path(session_id)
    if not path.exists():
        return []
    out: list[Event] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(Event.model_validate_json(line))
            except Exception:
                log.warning("could not parse audit line in %s", path)
    return out[-limit:]
