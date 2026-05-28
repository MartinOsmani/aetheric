"""LLM-as-judge attribution model.

For each journey we ask Claude Sonnet (fast + cheap) to assign per-touchpoint
credit. The model sees:
    - the touchpoint sequence (channel + time + content hint + channel description)
    - the conversion outcome (bool) and revenue
    - the channel taxonomy with brief priors

It returns:
    - per-touchpoint credit ∈ [0, 1] summing to 1.0 (zeroed if non-converter)
    - per-touchpoint confidence ∈ [0, 1]
    - one-line reasoning per touchpoint

Why Sonnet, not Opus: cost and latency. Sonnet 4.6 is plenty for this scoped
judgement task and lets us run the eval (200 held-out journeys) for a few
quid in a couple of minutes.

Prompt caching: the instruction block + channel taxonomy is identical across
every call; we put a `cache_control` breakpoint on it so the prefix is served
from cache after the first journey.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any

from anthropic import AsyncAnthropic

from ...config import settings
from .journeys import _CHANNEL_DESCRIPTIONS, ALL_CHANNELS, Journey

log = logging.getLogger(__name__)

_JUDGE_MODEL = "claude-sonnet-4-6"   # cheap + fast for batch eval

_SYSTEM_PROMPT = """You are an attribution analyst for AI-native advertising.

Your job is to assign per-touchpoint causal credit for a user journey across
AI-surface ad exposures and other channels.

You will receive a journey: a sequence of touchpoints (channel, time offset,
content hint) and the final conversion outcome.

Channel taxonomy:
""" + "\n".join(f"- {c}: {d}" for c, d in _CHANNEL_DESCRIPTIONS.items()) + """

Priors:
- AI-surface placements (ai_chat_sponsored_answer, prompt_aware_native,
  sponsored_autocomplete) carry stronger intent signal than display retargeting
  for AI-native advertising — they meet users at the moment of high intent.
- Display retargeting is weak signal; it tends to be a vanity touchpoint.
- Organic search is essentially uncredited spend-wise but indicates pre-existing
  intent.
- Repeated exposures on the same channel SATURATE — diminishing returns.
- Earlier exposures often shape intent more than later ones once intent is high.

If the user did NOT convert, all touchpoints get credit 0.0.

If the user DID convert, return per-touchpoint credits summing to 1.0 across
the journey, and a confidence score in [0, 1] reflecting how certain you are
in that assignment. Be honest about uncertainty: confidence < 0.5 means you
genuinely can't tell which touchpoint drove the outcome.

Return STRICT JSON only — no prose."""

# Output JSON schema — keep flat and predictable.
_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "touchpoints": {
            "type": "array",
            "description": "One entry per input touchpoint, same order.",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "credit": {"type": "number", "description": "Causal credit ∈ [0, 1]."},
                    "confidence": {"type": "number", "description": "How confident, ∈ [0, 1]."},
                    "reason": {"type": "string", "description": "One short sentence."},
                },
                "required": ["index", "credit", "confidence", "reason"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["touchpoints"],
    "additionalProperties": False,
}


@dataclass
class TouchpointAttribution:
    index: int
    credit: float
    confidence: float
    reason: str


@dataclass
class JourneyAttribution:
    journey_id: str
    touchpoint_attributions: list[TouchpointAttribution]
    raw_credit_sum: float           # before normalisation (sanity)
    is_uncertain: bool              # any touchpoint with confidence < 0.5
    elapsed_ms: int


_client: AsyncAnthropic | None = None


def _get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        if not settings.has_anthropic:
            raise RuntimeError("ANTHROPIC_API_KEY required to run attribution model")
        _client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


def _user_prompt(journey: Journey) -> str:
    return (
        "Assign credit for this journey. Return JSON matching the schema.\n\n"
        + json.dumps(journey.public_view(), indent=2, ensure_ascii=False)
    )


async def attribute(journey: Journey, *, model: str = _JUDGE_MODEL) -> JourneyAttribution:
    """Run the LLM-as-judge over one journey."""
    import time
    started = time.perf_counter()
    client = _get_client()

    # Non-converters: short-circuit, no LLM call needed.
    if not journey.converted:
        return JourneyAttribution(
            journey_id=journey.journey_id,
            touchpoint_attributions=[
                TouchpointAttribution(index=tp.index, credit=0.0, confidence=1.0, reason="non-converter")
                for tp in journey.touchpoints
            ],
            raw_credit_sum=0.0,
            is_uncertain=False,
            elapsed_ms=int((time.perf_counter() - started) * 1000),
        )

    response = await client.messages.create(
        model=model,
        max_tokens=2048,
        system=[
            {"type": "text", "text": _SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}},
        ],
        messages=[{"role": "user", "content": _user_prompt(journey)}],
        output_config={
            "format": {"type": "json_schema", "schema": _OUTPUT_SCHEMA},
            "effort": "medium",
        },
        thinking={"type": "adaptive"},
    )

    # Pull the first text block — output_config.format guarantees valid JSON.
    text = next((b.text for b in response.content if b.type == "text"), None)
    if not text:
        raise RuntimeError(f"empty attribution response for {journey.journey_id}")
    parsed = json.loads(text)

    # Normalise: enforce sum-to-1.0 (LLM may drift slightly).
    raw_credits = [float(tp.get("credit", 0.0)) for tp in parsed["touchpoints"]]
    raw_sum = sum(raw_credits) or 1e-9
    normalised = [c / raw_sum for c in raw_credits]

    attrs: list[TouchpointAttribution] = []
    for i, tp in enumerate(parsed["touchpoints"]):
        attrs.append(
            TouchpointAttribution(
                index=int(tp["index"]),
                credit=normalised[i],
                confidence=max(0.0, min(1.0, float(tp.get("confidence", 0.5)))),
                reason=str(tp.get("reason", ""))[:200],
            )
        )

    # Reorder defensively in case the model jumbled indices.
    attrs.sort(key=lambda a: a.index)

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    log.info(
        "attribution: %s converted=%s n_tp=%d elapsed=%dms",
        journey.journey_id, journey.converted, len(attrs), elapsed_ms,
    )

    return JourneyAttribution(
        journey_id=journey.journey_id,
        touchpoint_attributions=attrs,
        raw_credit_sum=raw_sum,
        is_uncertain=any(a.confidence < 0.5 for a in attrs),
        elapsed_ms=elapsed_ms,
    )


# --------------------------------------------------------------------------- #
# Baseline: last-touch attribution (the bar we beat)
# --------------------------------------------------------------------------- #


def last_touch_attribution(journey: Journey) -> JourneyAttribution:
    """All credit to the last touchpoint. This is what 90% of attribution
    products do, and it's measurably bad on multi-channel AI-surface journeys —
    that's our headline-number talking point."""
    if not journey.converted:
        return JourneyAttribution(
            journey_id=journey.journey_id,
            touchpoint_attributions=[
                TouchpointAttribution(index=tp.index, credit=0.0, confidence=1.0, reason="non-converter")
                for tp in journey.touchpoints
            ],
            raw_credit_sum=0.0,
            is_uncertain=False,
            elapsed_ms=0,
        )
    n = len(journey.touchpoints)
    return JourneyAttribution(
        journey_id=journey.journey_id,
        touchpoint_attributions=[
            TouchpointAttribution(
                index=tp.index,
                credit=(1.0 if i == n - 1 else 0.0),
                confidence=1.0,
                reason="last-touch",
            )
            for i, tp in enumerate(journey.touchpoints)
        ],
        raw_credit_sum=1.0,
        is_uncertain=False,
        elapsed_ms=0,
    )


# --------------------------------------------------------------------------- #
# Batch helper
# --------------------------------------------------------------------------- #


async def attribute_many(
    journeys: list[Journey],
    *,
    model: str = _JUDGE_MODEL,
    concurrency: int = 6,
) -> list[JourneyAttribution]:
    """Run the LLM judge over many journeys concurrently."""
    sem = asyncio.Semaphore(concurrency)

    async def _one(j: Journey) -> JourneyAttribution:
        async with sem:
            try:
                return await attribute(j, model=model)
            except Exception as exc:  # noqa: BLE001
                log.exception("attribute failed for %s", j.journey_id)
                # Fall back to uniform credit so the eval doesn't crash.
                n = len(j.touchpoints)
                share = (1.0 / n) if j.converted else 0.0
                return JourneyAttribution(
                    journey_id=j.journey_id,
                    touchpoint_attributions=[
                        TouchpointAttribution(
                            index=tp.index,
                            credit=share,
                            confidence=0.0,
                            reason=f"FALLBACK: {exc!r}",
                        )
                        for tp in j.touchpoints
                    ],
                    raw_credit_sum=1.0 if j.converted else 0.0,
                    is_uncertain=True,
                    elapsed_ms=0,
                )

    return await asyncio.gather(*(_one(j) for j in journeys))
