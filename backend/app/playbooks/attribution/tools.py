"""Attribution playbook tools — wired into the agent runtime.

Tool surface:
    load_journey         (low)   — surface one journey + ground-truth-free public view
    list_journeys        (low)   — pick a few candidate journeys to look at
    attribute_journey    (low)   — run the LLM-as-judge over one journey (emits credit bands)
    get_eval_summary     (low)   — read the latest cached eval result
    propose_budget_shift (HIGH)  — propose reallocating spend based on credited channels;
                                    must be approved by operator

The HIGH-risk tool is what produces the demo's punch-line approval moment:
agent says "shift £200 from low-credit display retargeting to high-credit
sponsored AI answers", and the cockpit pauses for the operator's tap.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from ...agent.tools_registry import Tool, ToolContext
from ...event_bus import bus
from ...protocol import Event, Playbook, PlaybookEvent
from . import attribution_model, journeys

log = logging.getLogger(__name__)


# In-memory cache of loaded datasets per session to keep things snappy.
_dataset_cache: dict[str, list[journeys.Journey]] = {}


def _load_for_session(session_id: str) -> list[journeys.Journey]:
    if session_id not in _dataset_cache:
        _dataset_cache[session_id] = journeys.load_dataset()
    return _dataset_cache[session_id]


async def _emit(session_id: str, name: str, payload: dict) -> None:
    await bus.publish(
        Event.make(
            session_id,
            "playbook.event",
            PlaybookEvent(playbook=Playbook.ATTRIBUTION, name=name, payload=payload),
        )
    )


# --------------------------------------------------------------------------- #
# list_journeys
# --------------------------------------------------------------------------- #


async def _list_journeys_handler(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    converted_only = bool(args.get("converted_only", True))
    limit = max(1, min(int(args.get("limit", 5)), 25))
    js = _load_for_session(ctx.session_id)
    candidates = [j for j in js if (j.converted or not converted_only)]
    out = [
        {
            "journey_id": j.journey_id,
            "user_segment": j.user_segment,
            "n_touchpoints": len(j.touchpoints),
            "converted": j.converted,
            "revenue": round(j.revenue_if_converted, 2),
        }
        for j in candidates[:limit]
    ]
    return {"count": len(out), "journeys": out}


def list_journeys_tool() -> Tool:
    return Tool(
        name="list_journeys",
        description=(
            "List candidate user journeys available for attribution analysis. "
            "By default surfaces converters (where credit assignment is meaningful)."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "converted_only": {"type": "boolean", "default": True},
                "limit": {"type": "integer", "minimum": 1, "maximum": 25, "default": 5},
            },
            "required": [],
        },
        handler=_list_journeys_handler,
    )


# --------------------------------------------------------------------------- #
# load_journey
# --------------------------------------------------------------------------- #


async def _load_journey_handler(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    jid = str(args["journey_id"])
    js = _load_for_session(ctx.session_id)
    j = next((x for x in js if x.journey_id == jid), None)
    if j is None:
        return {"error": f"unknown journey_id: {jid}"}

    view = j.public_view()
    # Emit a playbook event so the cockpit lights up its JourneyView
    await _emit(ctx.session_id, "journey_loaded", view)
    return view


def load_journey_tool() -> Tool:
    return Tool(
        name="load_journey",
        description=(
            "Load one specific journey by id, returning its touchpoint sequence and "
            "conversion outcome. Use after `list_journeys` to pick one for analysis. "
            "Emits a cockpit event so the operator sees the journey rendered."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "journey_id": {"type": "string", "description": "e.g. 'j-00006'."},
            },
            "required": ["journey_id"],
        },
        handler=_load_journey_handler,
    )


# --------------------------------------------------------------------------- #
# attribute_journey
# --------------------------------------------------------------------------- #


async def _attribute_journey_handler(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    jid = str(args["journey_id"])
    js = _load_for_session(ctx.session_id)
    j = next((x for x in js if x.journey_id == jid), None)
    if j is None:
        return {"error": f"unknown journey_id: {jid}"}

    attribution = await attribution_model.attribute(j)

    # Build per-touchpoint enriched view for the response
    breakdown = []
    for ta in attribution.touchpoint_attributions:
        tp = j.touchpoints[ta.index]
        breakdown.append(
            {
                "index": ta.index,
                "channel": tp.channel,
                "minutes_offset": round(tp.minutes_offset, 1),
                "credit": round(ta.credit, 4),
                "confidence": round(ta.confidence, 3),
                "low_confidence": ta.confidence < 0.5,
                "reason": ta.reason,
            }
        )

    # Top-credited touchpoint
    top = max(breakdown, key=lambda b: b["credit"]) if breakdown else None

    # Emit a cockpit event with the credit bands
    await _emit(
        ctx.session_id,
        "credit_assigned",
        {
            "journey_id": j.journey_id,
            "converted": j.converted,
            "touchpoints": breakdown,
            "top_credit_channel": top["channel"] if top else None,
            "is_uncertain": attribution.is_uncertain,
        },
    )

    return {
        "journey_id": j.journey_id,
        "converted": j.converted,
        "touchpoint_breakdown": breakdown,
        "top_credit_channel": top["channel"] if top else None,
        "is_uncertain": attribution.is_uncertain,
        "n_low_confidence_touchpoints": sum(1 for b in breakdown if b["low_confidence"]),
        "elapsed_ms": attribution.elapsed_ms,
    }


def attribute_journey_tool() -> Tool:
    return Tool(
        name="attribute_journey",
        description=(
            "Run the Aetheric LLM-as-judge attribution model on one journey, returning "
            "per-touchpoint causal credit with confidence intervals. Low-confidence "
            "touchpoints are explicitly flagged so the operator knows what NOT to act on."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "journey_id": {"type": "string"},
            },
            "required": ["journey_id"],
        },
        handler=_attribute_journey_handler,
    )


# --------------------------------------------------------------------------- #
# get_eval_summary  — read the cached eval result
# --------------------------------------------------------------------------- #


async def _get_eval_summary_handler(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from .eval_harness import EVAL_RUNS_DIR

    latest = EVAL_RUNS_DIR / "latest"
    summary_path = latest / "summary.json"
    if not summary_path.exists():
        return {
            "error": (
                "No cached eval result. Run `uv run python -m app.playbooks."
                "attribution.eval_harness --n 50` first."
            )
        }
    return json.loads(summary_path.read_text())


def get_eval_summary_tool() -> Tool:
    return Tool(
        name="get_eval_summary",
        description=(
            "Read the latest cached held-out attribution accuracy report: "
            "credit MAE, calibration error, top-touchpoint match rate, and the "
            "comparison vs the last-touch industry baseline. Always call this "
            "first when asked 'how accurate is our attribution?'."
        ),
        input_schema={"type": "object", "properties": {}, "required": []},
        handler=_get_eval_summary_handler,
    )


# --------------------------------------------------------------------------- #
# propose_budget_shift — HIGH-risk by magnitude
# --------------------------------------------------------------------------- #


async def _propose_budget_shift_handler(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from_channel = str(args["from_channel"])
    to_channel = str(args["to_channel"])
    amount = float(args["amount"])
    reason = str(args.get("reason", ""))

    if amount <= 0:
        return {"ok": False, "error": "amount must be positive"}

    # In real life this would post to Thrad / DSP. Here it's an audited
    # mutation event — the demo punchline.
    await _emit(
        ctx.session_id,
        "budget_shifted",
        {
            "from_channel": from_channel,
            "to_channel": to_channel,
            "amount": round(amount, 2),
            "reason": reason,
        },
    )
    return {
        "ok": True,
        "executed": {
            "from": from_channel,
            "to": to_channel,
            "amount_gbp": round(amount, 2),
            "reason": reason,
        },
    }


def propose_budget_shift_tool() -> Tool:
    return Tool(
        name="propose_budget_shift",
        description=(
            "Propose a reallocation of daily ad spend between two channels based "
            "on attribution-derived credit. This is a MATERIAL action that mutates "
            "real spend and requires operator approval before it executes."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "from_channel": {"type": "string", "description": "Channel to deprioritise."},
                "to_channel": {"type": "string", "description": "Channel to increase."},
                "amount": {"type": "number", "description": "£/day to move (positive)."},
                "reason": {"type": "string", "description": "One-sentence justification for the operator."},
            },
            "required": ["from_channel", "to_channel", "amount", "reason"],
        },
        handler=_propose_budget_shift_handler,
    )


# --------------------------------------------------------------------------- #


def all_tools() -> list[Tool]:
    return [
        list_journeys_tool(),
        load_journey_tool(),
        attribute_journey_tool(),
        get_eval_summary_tool(),
        propose_budget_shift_tool(),
    ]
