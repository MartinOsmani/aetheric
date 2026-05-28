"""Risk scorer — hybrid rule + LLM-aware scoring per tool call.

For tonight's MVP this is rules-only (deterministic, demo-stable). The LLM-
backed check is wired but disabled by default — we can flip it on the night
if we want a "smarter" demo, but rules are good enough to produce the
"agent paused and asked before doing something risky" moment on stage.

Rule heuristics:
- Read-only tools (search, fetch, get_*) → low.
- Mutating tools (adjust_*, pause_*, send_*, post_*) → medium by default.
- Mutating tools whose input crosses a magnitude threshold (e.g. budget shifts
  >= 100 units, full channel pauses) → high.
- Anything the agent explicitly flagged (`risk_hint` in input) → use that.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from ..protocol import Risk

log = logging.getLogger(__name__)


READ_ONLY_PREFIXES = (
    "get_",
    "list_",
    "search_",
    "fetch_",
    "describe_",
    "tavily_",
    "web_",
    "load_",
    "attribute_",
    "analyze_",
    "evaluate_",
    "compute_",
    "score_",
    "noop",
)

# Tools we know mutate state; anything starting with these is at least medium.
MUTATING_PREFIXES = (
    "adjust_",
    "pause_",
    "resume_",
    "create_",
    "update_",
    "delete_",
    "send_",
    "post_",
    "shift_",
    "allocate_",
)

# Specific tool names that always escalate to high.
ALWAYS_HIGH = {
    "shift_budget",
    "pause_adgroup",
    "pause_channel",
    "allocate_budget",
    "delete_campaign",
    "send_brand_safety_override",
    "propose_budget_shift",
    "refund_spend",
}

# Magnitude thresholds: a tool input field exceeding these escalates risk.
MAGNITUDE_HIGH_THRESHOLDS = {
    "amount": 100.0,         # money units
    "budget_delta": 100.0,
    "percent": 25.0,          # percentage points
}


@dataclass
class RiskAssessment:
    risk: Risk
    reason: str


def score(tool_name: str, tool_input: dict[str, Any]) -> RiskAssessment:
    """Rule-based scorer. Deterministic, no LLM call — fast and demo-stable."""
    # 1. Explicit hint from the agent (it can self-flag)
    hint = tool_input.get("risk_hint")
    if isinstance(hint, str) and hint in {r.value for r in Risk}:
        return RiskAssessment(Risk(hint), reason=f"Agent flagged {hint} via risk_hint.")

    # 2. Always-high names
    if tool_name in ALWAYS_HIGH:
        return RiskAssessment(Risk.HIGH, reason=f"`{tool_name}` mutates spend or pauses delivery — always high-risk.")

    # 3. Magnitude check on common numeric fields
    for field, threshold in MAGNITUDE_HIGH_THRESHOLDS.items():
        value = tool_input.get(field)
        if isinstance(value, (int, float)) and abs(value) >= threshold:
            return RiskAssessment(
                Risk.HIGH,
                reason=f"`{tool_name}` would change `{field}` by {value} (threshold {threshold}).",
            )

    # 4. Prefix-based default
    if tool_name.startswith(READ_ONLY_PREFIXES):
        return RiskAssessment(Risk.LOW, reason=f"`{tool_name}` is read-only.")
    if tool_name.startswith(MUTATING_PREFIXES):
        return RiskAssessment(Risk.MEDIUM, reason=f"`{tool_name}` mutates state; auto-executing with audit trail.")

    # 5. Fallback — unknown tool, conservative
    return RiskAssessment(Risk.MEDIUM, reason=f"`{tool_name}` not in registry; defaulting to medium-risk.")
