"""Thrad — placeholder adapter, swapped on the hackathon night.

The interface here is what the agent runtime expects to call; the
implementation behind it is mock-only until Giorgio announces API access on
stage at 18:05. Then we paste credentials into .env and the real wire-call
takes over.

Why mock-now-with-a-clean-interface: the architecture decision is the demo
signal — "drop-in adapter for prompt-aware ad placement". Implementation
detail is irrelevant.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from ..config import settings

log = logging.getLogger(__name__)


@dataclass
class AdPlacement:
    placement_id: str
    surface: str            # e.g. "chatgpt_sponsored_answer", "perplexity_inline"
    prompt_intent: str      # the intent Thrad matched on
    creative_url: str       # asset URL
    expected_cpm: float     # placeholder pricing


async def place_native_ad(
    *,
    prompt: str,
    brand_id: str,
    creative_assets: list[str] | None = None,
) -> AdPlacement:
    if not settings.thrad_api_key:
        # Mock — generate a plausible placement record.
        return AdPlacement(
            placement_id=f"mock-thrad-{abs(hash(prompt)) % 10_000:04d}",
            surface="chatgpt_sponsored_answer",
            prompt_intent=prompt[:120],
            creative_url=(creative_assets or ["https://example.com/creative.png"])[0],
            expected_cpm=4.20,
        )
    # Real call goes here when we have API access.
    raise NotImplementedError("Thrad live API not wired yet — paste creds and swap on the night.")
