"""Oversight invariant test.

The plan's verification section names this as a required check:
    'no `high`-risk action ever executes without a record in the approval queue.'

We test:
    1. risk_scorer.score classifies known mutating tool names as HIGH
    2. interceptor.execute_tool blocks a HIGH-risk call until the queue resolves
    3. a DENY decision short-circuits execution and surfaces an error string
       to the agent without calling the handler
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.agent.interceptor import execute_tool
from app.agent.tools_registry import Registry, Tool, ToolContext
from app.event_bus import EventBus
from app.oversight import approval_queue
from app.oversight.risk_scorer import score
from app.protocol import Decision, Playbook, Risk


@pytest.mark.asyncio
async def test_risk_scorer_classifies_known_mutators_as_high():
    assess = score("shift_budget", {"from_channel": "A", "to_channel": "B", "amount": 50.0})
    assert assess.risk == Risk.HIGH


@pytest.mark.asyncio
async def test_risk_scorer_treats_get_as_low():
    assess = score("get_metrics", {})
    assert assess.risk == Risk.LOW


@pytest.mark.asyncio
async def test_high_risk_call_blocks_until_approval_resolved():
    """The load-bearing invariant: a HIGH-risk call does NOT execute until the
    approval queue resolves with APPROVE."""
    bus = EventBus()
    registry = Registry()

    side_effects: list[dict[str, Any]] = []

    async def handler(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
        side_effects.append(args)
        return {"ok": True}

    registry.register(
        Tool(
            name="shift_budget",
            description="High-risk test tool",
            input_schema={"type": "object", "properties": {}},
            handler=handler,
        )
    )

    ctx = ToolContext(session_id="s-test", bus=bus, playbook=Playbook.MEDIA_BUYING)

    # Fire the high-risk call in a task, then assert it has NOT executed before
    # we resolve the approval queue.
    call_task = asyncio.create_task(
        execute_tool(
            registry=registry,
            ctx=ctx,
            tool_use_id="toolu_test_1",
            tool_name="shift_budget",
            tool_input={"amount": 200.0},
        )
    )

    # Give the interceptor a moment to publish the approval_required event and
    # park on the future.
    await asyncio.sleep(0.05)
    assert side_effects == [], "handler must not run before approval"

    # Resolve with APPROVE; the call should now complete.
    resolved = approval_queue.queue.resolve("toolu_test_1", Decision.APPROVE, note="test")
    assert resolved is True

    output, is_error = await call_task
    assert is_error is False
    assert side_effects == [{"amount": 200.0}], "handler must run after approval"


@pytest.mark.asyncio
async def test_high_risk_deny_short_circuits_without_executing_handler():
    bus = EventBus()
    registry = Registry()
    side_effects: list[dict[str, Any]] = []

    async def handler(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
        side_effects.append(args)
        return {"ok": True}

    registry.register(
        Tool(
            name="pause_channel",
            description="High-risk test tool",
            input_schema={"type": "object", "properties": {}},
            handler=handler,
        )
    )

    ctx = ToolContext(session_id="s-test", bus=bus, playbook=Playbook.MEDIA_BUYING)

    call_task = asyncio.create_task(
        execute_tool(
            registry=registry,
            ctx=ctx,
            tool_use_id="toolu_test_deny",
            tool_name="pause_channel",
            tool_input={"channel": "A"},
        )
    )
    await asyncio.sleep(0.05)
    approval_queue.queue.resolve("toolu_test_deny", Decision.DENY, note="not on a Friday")

    output, is_error = await call_task
    assert is_error is True
    assert "denied" in output.lower()
    assert side_effects == [], "handler must NOT run after a DENY decision"
