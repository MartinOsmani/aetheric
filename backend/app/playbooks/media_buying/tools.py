"""Tools the agent uses inside the media_buying playbook.

The four canonical tools from the plan:
    get_metrics    — read campaign state (low risk)
    shift_budget   — move budget between channels (high risk → approval)
    pause_channel  — pause an underperforming channel (high risk → approval)
    generate_report — summarise the run (low risk)

Plus a low-risk helper, `advance_days`, the agent calls to step the simulator
forward — keeps the demo paced and produces visible metric movement.
"""

from __future__ import annotations

from typing import Any

from ...agent.tools_registry import Tool, ToolContext
from ...event_bus import bus
from ...protocol import Event, Playbook, PlaybookEvent
from . import simulator

# A single in-memory campaign state, scoped per session_id. Demo-only — fine.
_states: dict[str, simulator.CampaignState] = {}


def _state(session_id: str) -> simulator.CampaignState:
    if session_id not in _states:
        _states[session_id] = simulator.CampaignState()
    return _states[session_id]


async def _emit_playbook_event(session_id: str, name: str, payload: dict) -> None:
    await bus.publish(
        Event.make(
            session_id,
            "playbook.event",
            PlaybookEvent(playbook=Playbook.MEDIA_BUYING, name=name, payload=payload),
        )
    )


# --------------------------------------------------------------------------- #
# get_metrics
# --------------------------------------------------------------------------- #


async def _get_metrics_handler(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    state = _state(ctx.session_id)
    return {
        "day": state.day,
        "channels": state.channel_summary(),
        "total_spend": round(state.total_spend(), 2),
        "total_revenue": round(state.total_revenue(), 2),
        "total_roas": round(state.total_roas(), 3),
    }


def get_metrics_tool() -> Tool:
    return Tool(
        name="get_metrics",
        description=(
            "Read the current campaign performance: per-channel spend, conversions, "
            "revenue, ROAS, and pause status. Always call this before proposing budget "
            "changes."
        ),
        input_schema={"type": "object", "properties": {}, "required": []},
        handler=_get_metrics_handler,
    )


# --------------------------------------------------------------------------- #
# advance_days  — agent steps the simulated market forward
# --------------------------------------------------------------------------- #


async def _advance_days_handler(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    days = int(args.get("days", 1))
    days = max(1, min(days, 14))
    state = _state(ctx.session_id)
    new_metrics = list(simulator.simulate_n(state, days, seed=42))

    # Emit playbook events for the cockpit chart
    for m in new_metrics:
        await _emit_playbook_event(
            ctx.session_id,
            "metrics_tick",
            {
                "day": m.day,
                "channel": m.channel,
                "spend": round(m.spend, 2),
                "conversions": m.conversions,
                "revenue": round(m.revenue, 2),
                "paused": m.paused,
            },
        )

    return {
        "days_simulated": days,
        "current_day": state.day,
        "channels": state.channel_summary(),
    }


def advance_days_tool() -> Tool:
    return Tool(
        name="advance_days",
        description=(
            "Step the simulated campaign forward by N days, returning the new "
            "per-channel metrics. Use this to observe how trends evolve before "
            "proposing budget changes. 1-14 days per call."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "days": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 14,
                    "default": 1,
                },
            },
            "required": [],
        },
        handler=_advance_days_handler,
    )


# --------------------------------------------------------------------------- #
# shift_budget   — HIGH-risk via risk_scorer (matches ALWAYS_HIGH set)
# --------------------------------------------------------------------------- #


async def _shift_budget_handler(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from_channel = str(args["from_channel"]).upper()
    to_channel = str(args["to_channel"]).upper()
    amount = float(args["amount"])

    state = _state(ctx.session_id)
    if from_channel not in state.budgets or to_channel not in state.budgets:
        return {"ok": False, "error": f"unknown channel: {from_channel}/{to_channel}"}
    if amount <= 0:
        return {"ok": False, "error": "amount must be positive"}
    if state.budgets[from_channel] < amount:
        return {
            "ok": False,
            "error": (
                f"insufficient budget on {from_channel}: have "
                f"£{state.budgets[from_channel]:.2f}, asked £{amount:.2f}"
            ),
        }

    state.budgets[from_channel] -= amount
    state.budgets[to_channel] += amount
    await _emit_playbook_event(
        ctx.session_id,
        "budget_shifted",
        {
            "from": from_channel,
            "to": to_channel,
            "amount": round(amount, 2),
            "new_budgets": {c: round(b, 2) for c, b in state.budgets.items()},
        },
    )
    return {
        "ok": True,
        "from": from_channel,
        "to": to_channel,
        "amount": round(amount, 2),
        "new_budgets": {c: round(b, 2) for c, b in state.budgets.items()},
    }


def shift_budget_tool() -> Tool:
    return Tool(
        name="shift_budget",
        description=(
            "Move daily budget from one channel to another. Mutates campaign spend "
            "allocation — high-risk action, requires operator approval before it "
            "executes. Specify the source channel, target channel, and amount in £."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "from_channel": {"type": "string", "description": "Source channel id (A-E)."},
                "to_channel": {"type": "string", "description": "Target channel id (A-E)."},
                "amount": {
                    "type": "number",
                    "description": "£/day to move from source to target. Must be positive.",
                },
                "reason": {
                    "type": "string",
                    "description": "Why this move — one-sentence justification for the operator.",
                },
            },
            "required": ["from_channel", "to_channel", "amount", "reason"],
        },
        handler=_shift_budget_handler,
    )


# --------------------------------------------------------------------------- #
# pause_channel  — HIGH-risk
# --------------------------------------------------------------------------- #


async def _pause_channel_handler(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    channel = str(args["channel"]).upper()
    state = _state(ctx.session_id)
    if channel not in state.paused:
        return {"ok": False, "error": f"unknown channel: {channel}"}
    state.paused[channel] = True
    await _emit_playbook_event(
        ctx.session_id,
        "channel_paused",
        {"channel": channel, "at_day": state.day},
    )
    return {"ok": True, "channel": channel, "paused": True, "at_day": state.day}


def pause_channel_tool() -> Tool:
    return Tool(
        name="pause_channel",
        description=(
            "Pause delivery on a channel for the remainder of the campaign. "
            "High-risk action, requires operator approval. Use when a channel has "
            "decayed past its break-even ROAS and reallocation alone won't fix it."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "channel": {"type": "string", "description": "Channel id to pause (A-E)."},
                "reason": {"type": "string", "description": "One-sentence justification."},
            },
            "required": ["channel", "reason"],
        },
        handler=_pause_channel_handler,
    )


# --------------------------------------------------------------------------- #
# generate_report
# --------------------------------------------------------------------------- #


async def _generate_report_handler(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    state = _state(ctx.session_id)
    summary = {
        "days_run": state.day,
        "total_spend": round(state.total_spend(), 2),
        "total_revenue": round(state.total_revenue(), 2),
        "total_roas": round(state.total_roas(), 3),
        "channels": state.channel_summary(),
    }
    return summary


def generate_report_tool() -> Tool:
    return Tool(
        name="generate_report",
        description="Produce a final summary of campaign performance: spend, revenue, ROAS, per-channel breakdown.",
        input_schema={"type": "object", "properties": {}, "required": []},
        handler=_generate_report_handler,
    )


# --------------------------------------------------------------------------- #


def all_tools() -> list[Tool]:
    return [
        get_metrics_tool(),
        advance_days_tool(),
        shift_budget_tool(),
        pause_channel_tool(),
        generate_report_tool(),
    ]
