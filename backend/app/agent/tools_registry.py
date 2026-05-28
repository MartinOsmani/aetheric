"""Tool registry — dispatch table for Anthropic function calling.

Each tool has a name, description, JSON-schema input, and an async handler.
The registry produces the Anthropic-shaped tool list and dispatches calls.

Tools are organised by playbook. The registry is built per agent run so that
only the playbook-relevant tool surface is exposed — keeps the model focused
and prevents cross-playbook confusion.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from ..event_bus import EventBus
from ..protocol import Playbook

log = logging.getLogger(__name__)


@dataclass
class ToolContext:
    """Passed to every tool handler. Carries session identity + bus access for
    handlers that want to emit playbook UI events as they run."""

    session_id: str
    bus: EventBus
    playbook: Playbook


ToolHandler = Callable[[ToolContext, dict[str, Any]], Awaitable[Any]]


@dataclass
class Tool:
    name: str
    description: str
    input_schema: dict[str, Any]
    handler: ToolHandler

    def to_anthropic(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
        }


class Registry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"tool {tool.name} already registered")
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool:
        if name not in self._tools:
            raise KeyError(f"unknown tool: {name}")
        return self._tools[name]

    def names(self) -> list[str]:
        return list(self._tools.keys())

    def anthropic_schemas(self) -> list[dict[str, Any]]:
        return [t.to_anthropic() for t in self._tools.values()]


def build_registry(playbook: Playbook) -> Registry:
    """Construct the per-playbook tool surface.

    Imports are local to avoid pulling matplotlib / sklearn at module load.
    """
    from ..sponsors import tavily_adapter
    from . import builtin_tools

    reg = Registry()
    reg.register(builtin_tools.noop_tool())
    reg.register(tavily_adapter.tool())

    if playbook == Playbook.MEDIA_BUYING:
        from ..playbooks.media_buying import tools as media_tools
        for t in media_tools.all_tools():
            reg.register(t)
    elif playbook == Playbook.ATTRIBUTION:
        from ..playbooks.attribution import tools as attr_tools
        for t in attr_tools.all_tools():
            reg.register(t)

    log.info("built registry for playbook=%s with tools=%s", playbook, reg.names())
    return reg
