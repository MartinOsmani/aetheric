"""Market simulator for the media-buying playbook.

Deterministic-with-noise so the demo replays cleanly: same seed → same trajectory.
Five channels, 30 simulated days, non-stationary trends so optimisation has signal.

Channels:
    A: Sponsored AI answers (Thrad-like) — high CTR, modest scale
    B: Prompt-aware native (in-chat)     — declining mid-campaign, agent should pause
    C: Sponsored autocomplete            — improving mid-campaign, agent should fund
    D: Display retargeting               — stable, low CTR
    E: Podcast read-outs                 — high variance
"""

from __future__ import annotations

import random
from collections.abc import Iterable
from dataclasses import dataclass, field

CHANNELS: tuple[str, ...] = ("A", "B", "C", "D", "E")

_DEFAULT_INITIAL_BUDGET: dict[str, float] = {
    "A": 200.0,
    "B": 250.0,
    "C": 150.0,
    "D": 200.0,
    "E": 200.0,
}


def _trend(channel: str, day: int) -> float:
    """Per-channel non-stationary multiplier — what the agent should learn."""
    if channel == "B":
        # Decays after day 8
        return max(0.25, 1.0 - 0.06 * max(0, day - 8))
    if channel == "C":
        # Climbs after day 5
        return min(2.0, 1.0 + 0.08 * max(0, day - 5))
    if channel == "E":
        # Noisy stationary
        return 1.0
    return 1.0


def _conversion_rate(channel: str) -> float:
    return {"A": 0.018, "B": 0.012, "C": 0.022, "D": 0.006, "E": 0.014}[channel]


def _revenue_per_conversion(channel: str) -> float:
    return {"A": 35.0, "B": 28.0, "C": 42.0, "D": 18.0, "E": 30.0}[channel]


@dataclass
class DayMetrics:
    day: int
    channel: str
    spend: float
    impressions: int
    clicks: int
    conversions: int
    revenue: float
    paused: bool

    @property
    def roas(self) -> float:
        return self.revenue / self.spend if self.spend > 0 else 0.0


@dataclass
class CampaignState:
    day: int = 0
    budgets: dict[str, float] = field(default_factory=lambda: dict(_DEFAULT_INITIAL_BUDGET))
    paused: dict[str, bool] = field(default_factory=lambda: {c: False for c in CHANNELS})
    history: list[DayMetrics] = field(default_factory=list)

    def total_spend(self) -> float:
        return sum(m.spend for m in self.history)

    def total_revenue(self) -> float:
        return sum(m.revenue for m in self.history)

    def total_roas(self) -> float:
        spend = self.total_spend()
        return self.total_revenue() / spend if spend > 0 else 0.0

    def channel_summary(self) -> list[dict]:
        out = []
        for c in CHANNELS:
            ms = [m for m in self.history if m.channel == c]
            spend = sum(m.spend for m in ms)
            conv = sum(m.conversions for m in ms)
            rev = sum(m.revenue for m in ms)
            out.append(
                {
                    "channel": c,
                    "budget_per_day": round(self.budgets[c], 2),
                    "spend_to_date": round(spend, 2),
                    "conversions": conv,
                    "revenue": round(rev, 2),
                    "roas": round(rev / spend, 3) if spend > 0 else 0.0,
                    "paused": self.paused[c],
                }
            )
        return out


def simulate_day(state: CampaignState, *, rng: random.Random) -> list[DayMetrics]:
    """Advance the campaign by one day across all channels."""
    state.day += 1
    day_metrics: list[DayMetrics] = []
    for channel in CHANNELS:
        if state.paused[channel]:
            day_metrics.append(
                DayMetrics(
                    day=state.day, channel=channel, spend=0.0,
                    impressions=0, clicks=0, conversions=0, revenue=0.0, paused=True,
                )
            )
            continue

        spend = state.budgets[channel]
        trend = _trend(channel, state.day)
        # Impressions scale with spend × trend × small noise
        impressions = int(spend * 12 * trend * rng.uniform(0.9, 1.1))
        ctr = 0.025 * trend * rng.uniform(0.85, 1.15)
        clicks = int(impressions * ctr)
        cvr = _conversion_rate(channel) * rng.uniform(0.8, 1.2)
        conversions = int(clicks * cvr)
        revenue = conversions * _revenue_per_conversion(channel) * rng.uniform(0.9, 1.1)

        day_metrics.append(
            DayMetrics(
                day=state.day,
                channel=channel,
                spend=spend,
                impressions=impressions,
                clicks=clicks,
                conversions=conversions,
                revenue=revenue,
                paused=False,
            )
        )

    state.history.extend(day_metrics)
    return day_metrics


def simulate_n(state: CampaignState, days: int, *, seed: int = 42) -> Iterable[DayMetrics]:
    """Generator: yield day-by-day metrics. Deterministic on (seed, history)."""
    rng = random.Random(seed + state.day)
    for _ in range(days):
        for m in simulate_day(state, rng=rng):
            yield m
