"""Sponsor adapters — Tavily (live), Thrad (placeholder), Overmind (placeholder).

Each adapter exposes the same shape:
- A `tool()` function returning a `Tool` for the registry, OR
- A typed client class for non-tool integrations (e.g. an Overmind audit-stream
  forwarder).

The Thrad and Overmind modules are stubs we expect to swap on the hackathon
night once API access is announced. The interfaces stay; only the
implementation behind them changes.
"""
