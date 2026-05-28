"""Tavily — live web grounding for the agent.

If `TAVILY_API_KEY` is set, calls the real Tavily Search API. Otherwise
falls back to a typed mock so the demo still runs end-to-end. The model can't
tell the difference at the tool-call boundary, which is what matters.
"""

from __future__ import annotations

import logging
from typing import Any

from ..agent.tools_registry import Tool, ToolContext
from ..config import settings

log = logging.getLogger(__name__)


_MOCK_RESULTS = {
    "default": {
        "answer": (
            "AI-native advertising spend is forecast to exceed $4B in 2026, driven by "
            "in-chat sponsored answers (Perplexity, ChatGPT) and prompt-aware native "
            "placements."
        ),
        "results": [
            {
                "title": "Thrad raises $4M to monetise AI chats",
                "url": "https://example.com/thrad",
                "content": (
                    "Thrad's prompt-aware ad infrastructure is live inside ChatGPT's "
                    "sponsored-suggestion program; the company hired a Diageo CCO to "
                    "make the channel investable for brand budgets."
                ),
            },
            {
                "title": "Overmind seed round: supervision layer for agents",
                "url": "https://example.com/overmind",
                "content": (
                    "Ex-MI5 founder building observability + drift detection + human "
                    "approval queues for production AI agents in regulated sectors."
                ),
            },
        ],
    }
}


async def _live_search(query: str, max_results: int) -> dict[str, Any]:
    from tavily import AsyncTavilyClient

    client = AsyncTavilyClient(api_key=settings.tavily_api_key)
    raw = await client.search(query=query, max_results=max_results, include_answer="basic")
    # Normalise to the same shape as the mock
    return {
        "answer": raw.get("answer"),
        "results": [
            {
                "title": r.get("title"),
                "url": r.get("url"),
                "content": r.get("content", "")[:600],
            }
            for r in raw.get("results", [])
        ],
    }


async def _mock_search(query: str, max_results: int) -> dict[str, Any]:
    log.info("tavily mock: returning canned results for query=%s", query[:80])
    data = _MOCK_RESULTS["default"]
    return {
        "answer": data["answer"],
        "results": data["results"][:max_results],
        "_source": "mock",
    }


async def _handler(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    query = str(args.get("query", "")).strip()
    if not query:
        return {"error": "query is required"}
    max_results = int(args.get("max_results", 3))
    max_results = max(1, min(max_results, 10))

    if settings.has_tavily:
        try:
            return await _live_search(query, max_results)
        except Exception as exc:  # noqa: BLE001
            log.warning("tavily live search failed, falling back to mock: %r", exc)
            result = await _mock_search(query, max_results)
            result["_warning"] = f"live tavily failed: {exc!r}"
            return result
    return await _mock_search(query, max_results)


def tool() -> Tool:
    return Tool(
        name="tavily_search",
        description=(
            "Search the live web for recent context relevant to the user's question. "
            "Use for breaking news, brand context, competitor moves, market sizing — "
            "anything where the model's training data is likely stale. Returns a brief "
            "answer plus 1–5 source snippets."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural-language search query.",
                },
                "max_results": {
                    "type": "integer",
                    "description": "How many source results to return (1–10, default 3).",
                    "default": 3,
                    "minimum": 1,
                    "maximum": 10,
                },
            },
            "required": ["query"],
        },
        handler=_handler,
    )
