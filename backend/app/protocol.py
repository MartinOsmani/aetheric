"""Aetheric event protocol.

The single source of truth for what flows across the /ws WebSocket between the
backend agent runtime and the React cockpit. Every event is wrapped in `Event`
and tagged with a discriminator `type`. The frontend mirrors these shapes —
keep both sides in sync.

Why this lives in one file: it's also the audit-log row schema. Append-only
JSONL of `Event.model_dump_json()` is the "verifiability" story we sell to
Will Lewis (Duku) and the Overmind judges.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field

# --------------------------------------------------------------------------- #
# Enums
# --------------------------------------------------------------------------- #


class Risk(str, Enum):
    LOW = "low"        # auto-execute, audit-logged
    MEDIUM = "medium"  # execute, audit-logged, UI-flagged
    HIGH = "high"      # block, route to approval queue, agent pauses


class Decision(str, Enum):
    APPROVE = "approve"
    DENY = "deny"


class Playbook(str, Enum):
    ATTRIBUTION = "attribution"
    MEDIA_BUYING = "media_buying"


# --------------------------------------------------------------------------- #
# Event payload models (the `data` of an Event)
# --------------------------------------------------------------------------- #


class AgentThinkingData(BaseModel):
    """Agent reasoning trace — chain-of-thought / decision rationale."""
    text: str


class AgentMessageData(BaseModel):
    """Free-form text the agent surfaces to the user."""
    text: str


class ToolCallProposed(BaseModel):
    """Agent proposed a tool call; oversight has scored its risk."""
    tool_use_id: str
    tool_name: str
    tool_input: dict[str, Any]
    risk: Risk
    risk_reason: str   # one-line explanation from the risk scorer


class ToolCallExecuted(BaseModel):
    """A tool ran (after passing oversight). Result is the truncated string view."""
    tool_use_id: str
    tool_name: str
    output_preview: str
    is_error: bool = False
    duration_ms: int


class AgentCompleteData(BaseModel):
    stop_reason: str  # end_turn | max_tokens | stop_sequence | tool_use | refusal


class ApprovalRequired(BaseModel):
    """High-risk call is blocked; needs a human decision."""
    tool_use_id: str
    tool_name: str
    tool_input: dict[str, Any]
    risk_reason: str


class ApprovalResolved(BaseModel):
    tool_use_id: str
    decision: Decision
    by: Literal["human", "auto", "timeout"]
    note: str | None = None


class KillTriggered(BaseModel):
    reason: str


class PlaybookEvent(BaseModel):
    """Generic envelope for playbook-specific UI events (charts, journeys, etc.)."""
    playbook: Playbook
    name: str            # e.g. "journey_loaded", "credit_assigned", "metrics_tick"
    payload: dict[str, Any]


# --------------------------------------------------------------------------- #
# Event envelope
# --------------------------------------------------------------------------- #


EventType = Literal[
    "agent.thinking",
    "agent.message",
    "agent.tool_call_proposed",
    "agent.tool_call_executed",
    "agent.complete",
    "oversight.approval_required",
    "oversight.approval_resolved",
    "oversight.kill_triggered",
    "playbook.event",
    "session.started",
    "session.error",
]


class Event(BaseModel):
    """The on-the-wire envelope for every WebSocket message + audit-log row."""
    id: str = Field(default_factory=lambda: uuid4().hex)
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))
    session_id: str
    type: EventType
    data: dict[str, Any]

    @classmethod
    def make(cls, session_id: str, type_: EventType, data: BaseModel | dict) -> Event:
        payload = data.model_dump(mode="json") if isinstance(data, BaseModel) else data
        return cls(session_id=session_id, type=type_, data=payload)


# --------------------------------------------------------------------------- #
# REST request/response models
# --------------------------------------------------------------------------- #


class RunAgentRequest(BaseModel):
    session_id: str | None = None
    playbook: Playbook = Playbook.ATTRIBUTION
    user_message: str
    demo_mode: bool = False   # if True, drive from canned seed data


class ApprovalDecisionRequest(BaseModel):
    session_id: str
    tool_use_id: str
    decision: Decision
    note: str | None = None


class KillRequest(BaseModel):
    session_id: str
    reason: str = "Operator pulled kill switch."
