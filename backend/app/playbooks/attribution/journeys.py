"""Synthetic user-journey generator for AI-native attribution.

We generate journeys with KNOWN GROUND TRUTH causal credit so the eval is
defensible. This is the dissertation discipline applied — 95% of attribution
work in industry can't produce a defensible per-touchpoint accuracy number
because real data has no ground truth. Ours does.

Generation model:
- Each user starts with latent intent_t0 ∈ [0, 0.3].
- They are exposed to N touchpoints over T minutes. Each touchpoint k on
  channel c has a TRUE intent shift: Δ_k = base_shift[c] · exposure_decay(k) · ε_k.
- The cumulative intent crosses the conversion threshold (0.7) → conversion.
- The ground-truth credit attributed to touchpoint k is its share of the
  total intent shift that pushed the user past the threshold:
      credit_k = Δ_k / Σ_j Δ_j     (only for converters)
  For non-converters, ground-truth credit is zero per touchpoint (the channel
  failed to convert; no credit to assign).

The agent only sees:
    - the touchpoint sequence (channel + time + content_hint)
    - the conversion outcome (bool)
It must reproduce credit_k WITHOUT seeing intent or true Δ values.
"""

from __future__ import annotations

import json
import random
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Literal

from ...config import DATA_DIR

DATA_DIR_ATTR = DATA_DIR / "attribution"
DATA_DIR_ATTR.mkdir(parents=True, exist_ok=True)

# --------------------------------------------------------------------------- #
# Channel definitions
# --------------------------------------------------------------------------- #

Channel = Literal[
    "ai_chat_sponsored_answer",   # Thrad-like — sponsored answer inside ChatGPT
    "prompt_aware_native",        # in-chat native placement on prompt intent
    "sponsored_autocomplete",     # sponsored suggestion in autocomplete
    "podcast_readout",            # podcast host-read sponsorship
    "display_retargeting",        # boring banner retargeting
    "organic_search",             # no-cost referrer (control)
]

ALL_CHANNELS: tuple[Channel, ...] = (
    "ai_chat_sponsored_answer",
    "prompt_aware_native",
    "sponsored_autocomplete",
    "podcast_readout",
    "display_retargeting",
    "organic_search",
)

# Base intent shift per exposure for each channel.
# AI-surface channels carry the highest signal (the thesis); display retargeting
# is weak; organic search is essentially neutral (already a converter signal).
_BASE_SHIFT: dict[Channel, float] = {
    "ai_chat_sponsored_answer": 0.18,
    "prompt_aware_native": 0.14,
    "sponsored_autocomplete": 0.10,
    "podcast_readout": 0.12,
    "display_retargeting": 0.04,
    "organic_search": 0.02,
}

# How quickly subsequent exposures on the same channel decay (saturation effect).
_DECAY: dict[Channel, float] = {
    "ai_chat_sponsored_answer": 0.55,
    "prompt_aware_native": 0.60,
    "sponsored_autocomplete": 0.70,
    "podcast_readout": 0.65,
    "display_retargeting": 0.85,
    "organic_search": 0.95,
}

_CHANNEL_DESCRIPTIONS: dict[Channel, str] = {
    "ai_chat_sponsored_answer": "Sponsored response surfaced inside an LLM chat answer (e.g. ChatGPT, Perplexity).",
    "prompt_aware_native": "Native ad inserted into a chat reply based on real-time prompt intent.",
    "sponsored_autocomplete": "Sponsored suggestion in the autocomplete or follow-up prompt.",
    "podcast_readout": "Host-read podcast sponsorship.",
    "display_retargeting": "Cookie/identifier-based display banner retargeting on a third-party site.",
    "organic_search": "Organic search result the user clicked on; no spend.",
}

CONVERSION_THRESHOLD = 0.7

# --------------------------------------------------------------------------- #
# Data classes
# --------------------------------------------------------------------------- #


@dataclass
class Touchpoint:
    """One exposure in a user's journey. The agent sees these without intent_shift."""

    index: int                # 0-based position in the journey
    channel: Channel
    minutes_offset: float     # time since journey start
    content_hint: str         # what the touchpoint was about
    intent_shift: float       # ground-truth Δ — hidden from the agent at attribution time

    def public_view(self) -> dict:
        """The shape the agent sees — NO intent_shift."""
        return {
            "index": self.index,
            "channel": self.channel,
            "minutes_offset": round(self.minutes_offset, 1),
            "content_hint": self.content_hint,
            "channel_description": _CHANNEL_DESCRIPTIONS[self.channel],
        }


@dataclass
class Journey:
    journey_id: str
    user_segment: str
    touchpoints: list[Touchpoint]
    initial_intent: float           # hidden
    final_intent: float             # hidden
    converted: bool
    revenue_if_converted: float
    ground_truth_credit: dict[int, float] = field(default_factory=dict)  # touchpoint index → credit (0-1)

    def public_view(self) -> dict:
        """The shape sent to the LLM-as-judge attribution model."""
        return {
            "journey_id": self.journey_id,
            "user_segment": self.user_segment,
            "converted": self.converted,
            "revenue_if_converted": round(self.revenue_if_converted, 2) if self.converted else 0.0,
            "touchpoints": [tp.public_view() for tp in self.touchpoints],
        }

    def to_record(self) -> dict:
        """Full record — including ground truth — for the eval harness."""
        return {
            **self.public_view(),
            "_ground_truth": {
                "initial_intent": round(self.initial_intent, 4),
                "final_intent": round(self.final_intent, 4),
                "credit": {str(k): round(v, 4) for k, v in self.ground_truth_credit.items()},
                "intent_shift_per_touchpoint": [round(tp.intent_shift, 4) for tp in self.touchpoints],
            },
        }


# --------------------------------------------------------------------------- #
# Generator
# --------------------------------------------------------------------------- #


USER_SEGMENTS = (
    "uk_b2b_saas_buyer",
    "uk_consumer_lifestyle",
    "us_d2c_retail",
    "us_b2b_developer",
    "global_enterprise_decision_maker",
)

CONTENT_HINTS_BY_CHANNEL: dict[Channel, list[str]] = {
    "ai_chat_sponsored_answer": [
        "Sponsored answer about 'best CRM for solo founders' featuring brand X.",
        "AI summary about 'AI invoicing tools' lists brand X first.",
        "User asked 'How do I track multi-channel attribution?' — sponsored answer mentioned brand X.",
        "Brand X surfaced as the recommended option in a comparison answer.",
    ],
    "prompt_aware_native": [
        "Native card in a chat reply when user asked about productivity.",
        "Inline native placement after a question about contract management.",
        "Prompt-matched native ad rendered alongside a 'best of 2025' query.",
    ],
    "sponsored_autocomplete": [
        "Sponsored autocomplete suggestion: 'brand X review'.",
        "Followup-prompt sponsorship for 'compare X vs competitors'.",
    ],
    "podcast_readout": [
        "Host-read mid-roll on a SaaS founder podcast.",
        "Pre-roll readout on a marketing podcast.",
        "Host endorsement segment, 90 seconds.",
    ],
    "display_retargeting": [
        "Programmatic display banner on a publisher site.",
        "Retargeting carousel on a news homepage.",
        "Social feed retargeting unit.",
    ],
    "organic_search": [
        "User clicked an organic Google result.",
        "User clicked a Reddit discussion thread on r/SaaS.",
    ],
}


def _exposure_decay(channel: Channel, exposures_so_far_on_channel: int) -> float:
    return _DECAY[channel] ** exposures_so_far_on_channel


def _generate_one(rng: random.Random, journey_idx: int) -> Journey:
    user_segment = rng.choice(USER_SEGMENTS)
    initial_intent = rng.uniform(0.0, 0.30)
    intent = initial_intent

    n_touchpoints = rng.randint(2, 7)
    seen_on_channel: dict[Channel, int] = {c: 0 for c in ALL_CHANNELS}
    touchpoints: list[Touchpoint] = []
    cumulative_minutes = 0.0

    for i in range(n_touchpoints):
        # Channel sampling — bias slightly toward AI-surface channels (this is
        # an AI-native advertising hackathon, after all). Display and organic
        # are still meaningfully present.
        channel = rng.choices(
            ALL_CHANNELS,
            weights=[0.25, 0.20, 0.12, 0.10, 0.18, 0.15],
            k=1,
        )[0]

        cumulative_minutes += rng.uniform(2.0, 120.0)
        content = rng.choice(CONTENT_HINTS_BY_CHANNEL[channel])

        # Apply the true intent shift
        base = _BASE_SHIFT[channel]
        decay = _exposure_decay(channel, seen_on_channel[channel])
        noise = rng.uniform(0.7, 1.3)
        delta = base * decay * noise

        intent = max(0.0, min(1.0, intent + delta))
        seen_on_channel[channel] += 1

        touchpoints.append(
            Touchpoint(
                index=i,
                channel=channel,
                minutes_offset=cumulative_minutes,
                content_hint=content,
                intent_shift=delta,
            )
        )

    final_intent = intent
    converted = final_intent >= CONVERSION_THRESHOLD

    revenue = 0.0
    if converted:
        revenue = rng.uniform(20.0, 250.0)

    # Ground-truth credit assignment: for converters, share of total Δ. For
    # non-converters, credit is zero (channel failed to convert this user).
    credit: dict[int, float] = {}
    if converted:
        total_delta = sum(tp.intent_shift for tp in touchpoints) or 1e-9
        for tp in touchpoints:
            credit[tp.index] = tp.intent_shift / total_delta
    else:
        credit = {tp.index: 0.0 for tp in touchpoints}

    return Journey(
        journey_id=f"j-{journey_idx:05d}",
        user_segment=user_segment,
        touchpoints=touchpoints,
        initial_intent=initial_intent,
        final_intent=final_intent,
        converted=converted,
        revenue_if_converted=revenue,
        ground_truth_credit=credit,
    )


def generate_dataset(n: int, seed: int = 42) -> list[Journey]:
    """Deterministic dataset of `n` journeys."""
    rng = random.Random(seed)
    return [_generate_one(rng, i) for i in range(n)]


def save_dataset(journeys: list[Journey], path: Path | None = None) -> Path:
    out = path or (DATA_DIR_ATTR / "journeys.jsonl")
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        for j in journeys:
            f.write(json.dumps(j.to_record(), ensure_ascii=False) + "\n")
    return out


def load_dataset(path: Path | None = None) -> list[Journey]:
    path = path or (DATA_DIR_ATTR / "journeys.jsonl")
    if not path.exists():
        return []
    out: list[Journey] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            gt = r["_ground_truth"]
            tps = [
                Touchpoint(
                    index=tp["index"],
                    channel=tp["channel"],
                    minutes_offset=tp["minutes_offset"],
                    content_hint=tp["content_hint"],
                    intent_shift=gt["intent_shift_per_touchpoint"][tp["index"]],
                )
                for tp in r["touchpoints"]
            ]
            out.append(
                Journey(
                    journey_id=r["journey_id"],
                    user_segment=r["user_segment"],
                    touchpoints=tps,
                    initial_intent=gt["initial_intent"],
                    final_intent=gt["final_intent"],
                    converted=r["converted"],
                    revenue_if_converted=r["revenue_if_converted"],
                    ground_truth_credit={int(k): v for k, v in gt["credit"].items()},
                )
            )
    return out


def split(journeys: list[Journey], test_frac: float = 0.20, seed: int = 13) -> tuple[list[Journey], list[Journey]]:
    """Deterministic train/test split — though we don't actually train, we just hold out for eval."""
    rng = random.Random(seed)
    shuffled = journeys[:]
    rng.shuffle(shuffled)
    cut = int(len(shuffled) * (1 - test_frac))
    return shuffled[:cut], shuffled[cut:]


def summary_stats(journeys: list[Journey]) -> dict:
    conv = sum(1 for j in journeys if j.converted)
    return {
        "n_journeys": len(journeys),
        "conversion_rate": round(conv / len(journeys), 3) if journeys else 0.0,
        "avg_touchpoints": round(sum(len(j.touchpoints) for j in journeys) / len(journeys), 2) if journeys else 0.0,
        "channels": {
            c: sum(1 for j in journeys for tp in j.touchpoints if tp.channel == c)
            for c in ALL_CHANNELS
        },
    }


if __name__ == "__main__":
    # Quick CLI: regenerate the default dataset.
    js = generate_dataset(n=500, seed=42)
    path = save_dataset(js)
    stats = summary_stats(js)
    print(f"Wrote {len(js)} journeys to {path}")
    print(json.dumps(stats, indent=2))
