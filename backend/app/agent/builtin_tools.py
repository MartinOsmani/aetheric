"""Tools that are always available regardless of playbook.

Right now: just `noop` — a no-side-effect tool used to smoke-test the
tool-loop + oversight pipeline without hitting any sponsor APIs.
"""

from __future__ import annotations

import logging
from typing import Any

from .tools_registry import Tool, ToolContext

log = logging.getLogger(__name__)


async def _noop_handler(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    msg = args.get("message", "ok")
    log.info("noop tool called: %s", msg)
    return {"ok": True, "echo": msg}


def noop_tool() -> Tool:
    return Tool(
        name="noop",
        description=(
            "A no-op debug tool. Call this only when explicitly asked to test the "
            "tool loop. Echoes the provided message back."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "A short string to echo back.",
                },
            },
            "required": ["message"],
        },
        handler=_noop_handler,
    )
