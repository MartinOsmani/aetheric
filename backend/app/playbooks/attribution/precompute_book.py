"""Pre-compute real attributions for the demo conversion book.

Runs the LLM-as-judge over the first N converting journeys (the same ones
`list_journeys` surfaces) and caches the per-journey credit_assigned payloads to
`data/attribution/demo_book.json`. `list_journeys` then emits these cached
attributions so the cockpit's "Aetheric says" column is fully populated the
moment the book loads — real numbers, no per-demo latency or token cost.

Usage:
    uv run python -m app.playbooks.attribution.precompute_book [--n 12]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging

from .attribution_model import attribute_many
from .journeys import DATA_DIR_ATTR, load_dataset

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
log = logging.getLogger("precompute_book")

BOOK_CACHE_PATH = DATA_DIR_ATTR / "demo_book.json"


def _credit_payload(journey, attribution) -> dict:
    """Mirror the credit_assigned payload built by attribute_journey_tool."""
    breakdown = []
    for ta in attribution.touchpoint_attributions:
        tp = journey.touchpoints[ta.index]
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
    top = max(breakdown, key=lambda b: b["credit"]) if breakdown else None
    return {
        "journey_id": journey.journey_id,
        "converted": journey.converted,
        "touchpoints": breakdown,
        "top_credit_channel": top["channel"] if top else None,
        "is_uncertain": attribution.is_uncertain,
    }


async def main(n: int) -> None:
    journeys = load_dataset()
    converters = [j for j in journeys if j.converted][:n]
    log.info("attributing %d converting journeys for the demo book…", len(converters))

    attributions = await attribute_many(converters)
    book = {
        j.journey_id: _credit_payload(j, a)
        for j, a in zip(converters, attributions)
    }

    BOOK_CACHE_PATH.write_text(json.dumps(book, indent=2))
    log.info("wrote %d cached attributions to %s", len(book), BOOK_CACHE_PATH)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=12)
    args = parser.parse_args()
    asyncio.run(main(args.n))
