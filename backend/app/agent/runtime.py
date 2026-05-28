"""Agent runtime — Anthropic Claude with a manual tool-call loop.

We use the manual loop (not the beta tool runner) because every tool call has
to flow through `interceptor.execute_tool` — that's the oversight gate that
defines this project. Beta tool runner would bypass it.

Streaming: we use `messages.stream` so the cockpit gets live `agent.thinking`
text. `display: "summarized"` is required on Opus 4.7 to see thinking content
at all (default is omitted).
"""

from __future__ import annotations

import logging
from typing import Any

from anthropic import AsyncAnthropic, NotGiven

from ..config import settings
from ..event_bus import bus
from ..protocol import (
    AgentCompleteData,
    AgentMessageData,
    AgentThinkingData,
    Event,
    Playbook,
)
from .interceptor import execute_tool
from .tools_registry import ToolContext, build_registry

log = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are Aetheric, an autonomous attribution + monetisation agent for
AI-native advertising publishers (Track 02: Sell-Side & Measurement).

Your job: stitch attribution from chat → click → conversion, score per-touchpoint
causal credit with calibrated confidence, surface uncertain attributions for
human review instead of over-claiming, and propose spend reallocations based
on what actually drove outcomes.

You operate under a visible oversight layer:
- Every action is risk-scored. Read-only analysis is auto-approved.
- Material spend mutations (propose_budget_shift, refund_spend, etc.) are
  HIGH-risk and route to a human approval queue before they execute. The
  operator sees your reasoning, your confidence, and your specific proposed
  values, then taps approve/deny.
- Do NOT skip the approval step or try to encode the change inside a read-only
  tool. The queue is the product, not a workaround.

Recommended demo flow when asked to "show what you can do" or similar:
1. Call `get_eval_summary` to surface our held-out attribution accuracy
   (we beat last-touch by ~5×; cite the number).
2. Call `list_journeys` to pick a converter to walk through.
3. Call `load_journey` then `attribute_journey` on it. Read the per-touchpoint
   credit and confidence aloud. Explicitly call out any low-confidence
   touchpoint as something we would NOT bet money on.
4. Based on the credit pattern, call `propose_budget_shift` to move spend
   from a low-credit channel to a high-credit one. This is HIGH-risk and
   will pause for operator approval — say so.
5. After approval, summarise the action + cite the audit log.

Style:
- Think briefly, concretely, with numbers.
- Quote the headline accuracy figure when relevant.
- When proposing a shift, name the magnitude in £, the source channel, the
  target channel, and the credit gap that justifies it.
- Be honest about uncertainty — flag low-confidence attributions explicitly
  rather than averaging them away.
"""


def _build_client() -> AsyncAnthropic | None:
    if not settings.has_anthropic:
        log.warning("ANTHROPIC_API_KEY not set — agent runtime will run in stub mode")
        return None
    return AsyncAnthropic(api_key=settings.anthropic_api_key)


_client = _build_client()


async def run_agent(
    *,
    session_id: str,
    playbook: Playbook,
    user_message: str,
    max_turns: int = 12,
) -> None:
    """Drive one agent turn-loop to completion, publishing events along the way.

    Returns after the agent emits `stop_reason == "end_turn"` (or refuses, or
    we hit `max_turns`).
    """
    await bus.publish(Event.make(session_id, "session.started", {"playbook": playbook.value}))

    if _client is None:
        await _run_stub(session_id=session_id, playbook=playbook, user_message=user_message)
        return

    registry = build_registry(playbook)
    ctx = ToolContext(session_id=session_id, bus=bus, playbook=playbook)
    messages: list[dict[str, Any]] = [
        {"role": "user", "content": user_message},
    ]
    tools = registry.anthropic_schemas()

    for turn in range(max_turns):
        log.info("agent turn %d (session=%s, playbook=%s)", turn, session_id, playbook.value)

        message = await _stream_one_turn(session_id=session_id, messages=messages, tools=tools)
        messages.append({"role": "assistant", "content": message.content})

        if message.stop_reason == "end_turn":
            await bus.publish(
                Event.make(
                    session_id,
                    "agent.complete",
                    AgentCompleteData(stop_reason="end_turn"),
                )
            )
            return

        if message.stop_reason in {"refusal", "max_tokens"}:
            await bus.publish(
                Event.make(
                    session_id,
                    "agent.complete",
                    AgentCompleteData(stop_reason=message.stop_reason),
                )
            )
            return

        # stop_reason == "tool_use" — execute and continue
        tool_results: list[dict[str, Any]] = []
        for block in message.content:
            if block.type != "tool_use":
                continue
            output_str, is_error = await execute_tool(
                registry=registry,
                ctx=ctx,
                tool_use_id=block.id,
                tool_name=block.name,
                tool_input=block.input,
            )
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": output_str,
                    "is_error": is_error,
                }
            )
        messages.append({"role": "user", "content": tool_results})

    log.warning("max_turns reached for session=%s — forcing completion", session_id)
    await bus.publish(
        Event.make(session_id, "agent.complete", AgentCompleteData(stop_reason="max_turns_reached"))
    )


async def _stream_one_turn(
    *,
    session_id: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
):
    """Issue one streaming Claude call, emit thinking/text deltas, return the
    final message object for the manual loop to inspect."""
    assert _client is not None
    thinking: dict[str, Any] | NotGiven = {"type": "adaptive", "display": "summarized"}

    async with _client.messages.stream(
        model=settings.aetheric_model,
        max_tokens=8192,
        system=SYSTEM_PROMPT,
        messages=messages,
        tools=tools,
        thinking=thinking,
        output_config={"effort": "high"},
    ) as stream:
        # Coalesce per-token deltas into one event per content block, keyed by
        # block index. Otherwise the cockpit gets 50+ `agent.message` events
        # per turn (one per token), which is unreadable noise. We emit the
        # full block text on content_block_stop instead.
        thinking_buffers: dict[int, list[str]] = {}
        text_buffers: dict[int, list[str]] = {}

        async for event in stream:
            etype = getattr(event, "type", None)
            idx = int(getattr(event, "index", 0) or 0)

            if etype == "content_block_delta":
                delta = event.delta
                dtype = getattr(delta, "type", None)
                if dtype == "thinking_delta":
                    t = getattr(delta, "thinking", "") or ""
                    if t:
                        thinking_buffers.setdefault(idx, []).append(t)
                elif dtype == "text_delta":
                    t = getattr(delta, "text", "") or ""
                    if t:
                        text_buffers.setdefault(idx, []).append(t)

            elif etype == "content_block_stop":
                if idx in thinking_buffers:
                    text = "".join(thinking_buffers.pop(idx)).strip()
                    if text:
                        await bus.publish(
                            Event.make(session_id, "agent.thinking", AgentThinkingData(text=text))
                        )
                if idx in text_buffers:
                    text = "".join(text_buffers.pop(idx)).strip()
                    if text:
                        await bus.publish(
                            Event.make(session_id, "agent.message", AgentMessageData(text=text))
                        )

        return await stream.get_final_message()


async def _run_stub(*, session_id: str, playbook: Playbook, user_message: str) -> None:
    """Fallback when no Anthropic API key is present.

    Emits a scripted sequence so the cockpit demo still works end-to-end. Useful
    for local dev and for the hackathon's "live LLM latency tanks demo" risk
    mitigation in the plan's risk register.
    """
    import asyncio

    log.info("running stub agent (no ANTHROPIC_API_KEY)")
    scripted = [
        ("agent.thinking", {"text": "No Anthropic key — running stub. Echoing the user message."}),
        ("agent.message", {"text": f"(stub) You said: {user_message}"}),
        ("agent.complete", {"stop_reason": "end_turn"}),
    ]
    for type_, data in scripted:
        await asyncio.sleep(0.15)
        await bus.publish(Event(session_id=session_id, type=type_, data=data))  # type: ignore[arg-type]
