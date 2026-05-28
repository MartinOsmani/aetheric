"""Tool-call interceptor — the heart of the oversight pipeline.

Every tool invocation flows through `execute_tool`. It:
1. Risk-scores the call.
2. Emits `agent.tool_call_proposed` so the cockpit shows what's about to happen.
3. If risk == HIGH, blocks on the approval queue until a human decides
   (or the timeout fires and we default-deny).
4. Otherwise, dispatches to the tool handler.
5. Emits `agent.tool_call_executed` with the truncated output.
6. Returns a string suitable for feeding back to the LLM as a tool_result.

The audit log catches everything via the global event-bus tap — no extra
plumbing here.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from ..event_bus import bus
from ..oversight import approval_queue, risk_scorer
from ..protocol import (
    Decision,
    Event,
    Risk,
    ToolCallExecuted,
    ToolCallProposed,
)
from .tools_registry import Registry, ToolContext

log = logging.getLogger(__name__)

_OUTPUT_PREVIEW_CHARS = 800


def _truncate(value: Any) -> str:
    s = value if isinstance(value, str) else repr(value)
    if len(s) > _OUTPUT_PREVIEW_CHARS:
        return s[:_OUTPUT_PREVIEW_CHARS] + f" … [truncated, {len(s)} chars total]"
    return s


async def execute_tool(
    *,
    registry: Registry,
    ctx: ToolContext,
    tool_use_id: str,
    tool_name: str,
    tool_input: dict[str, Any],
) -> tuple[str, bool]:
    """Run one tool call through the oversight gate.

    Returns (tool_result_string, is_error). Always returns — even when blocked
    or denied — so the calling agent loop can feed a tool_result back to Claude.
    """
    # 1. Risk score
    assessment = risk_scorer.score(tool_name, tool_input)

    # 2. Announce the proposed call
    await bus.publish(
        Event.make(
            ctx.session_id,
            "agent.tool_call_proposed",
            ToolCallProposed(
                tool_use_id=tool_use_id,
                tool_name=tool_name,
                tool_input=tool_input,
                risk=assessment.risk,
                risk_reason=assessment.reason,
            ),
        )
    )

    # 3. Gate on HIGH risk
    if assessment.risk == Risk.HIGH:
        decision = await approval_queue.queue.submit_and_wait(
            session_id=ctx.session_id,
            tool_use_id=tool_use_id,
            tool_name=tool_name,
            tool_input=tool_input,
            risk_reason=assessment.reason,
        )
        if decision.decision == Decision.DENY:
            denial = (
                f"Action denied by operator. Reason: "
                f"{decision.note or 'no reason given'}"
            )
            await bus.publish(
                Event.make(
                    ctx.session_id,
                    "agent.tool_call_executed",
                    ToolCallExecuted(
                        tool_use_id=tool_use_id,
                        tool_name=tool_name,
                        output_preview=denial,
                        is_error=True,
                        duration_ms=0,
                    ),
                )
            )
            return denial, True

    # 4. Dispatch
    started = time.perf_counter()
    try:
        tool = registry.get(tool_name)
    except KeyError:
        err = f"Unknown tool: {tool_name!r}. Available: {registry.names()}"
        await bus.publish(
            Event.make(
                ctx.session_id,
                "agent.tool_call_executed",
                ToolCallExecuted(
                    tool_use_id=tool_use_id,
                    tool_name=tool_name,
                    output_preview=err,
                    is_error=True,
                    duration_ms=0,
                ),
            )
        )
        return err, True

    try:
        result = await tool.handler(ctx, tool_input)
        is_error = False
        output_str = result if isinstance(result, str) else _stringify(result)
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001 — surface any tool failure to the model
        log.exception("tool %s raised", tool_name)
        output_str = f"Tool {tool_name} raised: {exc!r}"
        is_error = True

    duration_ms = int((time.perf_counter() - started) * 1000)
    await bus.publish(
        Event.make(
            ctx.session_id,
            "agent.tool_call_executed",
            ToolCallExecuted(
                tool_use_id=tool_use_id,
                tool_name=tool_name,
                output_preview=_truncate(output_str),
                is_error=is_error,
                duration_ms=duration_ms,
            ),
        )
    )
    return output_str, is_error


def _stringify(value: Any) -> str:
    import json

    try:
        return json.dumps(value, ensure_ascii=False, indent=2, default=str)
    except (TypeError, ValueError):
        return repr(value)
