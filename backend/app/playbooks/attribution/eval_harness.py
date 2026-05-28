"""Eval harness — the headline-number generator.

What it does (in order):
1. Load the synthetic journey dataset.
2. Split 80/20 train/test (we don't actually train — the LLM judge is
   zero-shot — but holding out a test set keeps the eval honest).
3. Run two attribution models over the test set:
   - Ours (LLM-as-judge over Sonnet)
   - Last-touch baseline (industry default)
4. Compute, per model:
   - **Credit MAE** (mean absolute error vs ground truth, averaged over all
     touchpoints in all converter journeys)
   - **Top-channel match** (does the model agree with ground truth on which
     touchpoint mattered most?)
   - **Calibration error (ECE)** — for our model only; baseline has no confidence
5. Produce a reliability diagram (matplotlib → PNG) and a JSON summary.

Both artefacts land in `data/attribution/eval_runs/<timestamp>/` so the
cockpit /eval route can render the latest, and the demo always shows a
fresh result.

Usage:
    uv run python -m app.playbooks.attribution.eval_harness [--n 100]

The default is 50 held-out journeys; pass --n to override.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # headless
import matplotlib.pyplot as plt
import numpy as np

from .attribution_model import (
    JourneyAttribution,
    attribute_many,
    last_touch_attribution,
)
from .journeys import (
    DATA_DIR_ATTR,
    Journey,
    generate_dataset,
    load_dataset,
    save_dataset,
    split,
    summary_stats,
)

log = logging.getLogger(__name__)

EVAL_RUNS_DIR = DATA_DIR_ATTR / "eval_runs"


# --------------------------------------------------------------------------- #
# Metric helpers
# --------------------------------------------------------------------------- #


def _credit_mae(journey: Journey, attribution: JourneyAttribution) -> float:
    """Mean absolute error between predicted and ground-truth credit, over
    touchpoints of this journey."""
    diffs = []
    for ta in attribution.touchpoint_attributions:
        gt = journey.ground_truth_credit.get(ta.index, 0.0)
        diffs.append(abs(ta.credit - gt))
    return float(np.mean(diffs)) if diffs else 0.0


def _top_channel_match(journey: Journey, attribution: JourneyAttribution) -> bool:
    """Does the model agree with ground truth on which touchpoint mattered most?
    Only meaningful on converters."""
    if not journey.converted or not journey.ground_truth_credit:
        return True  # vacuously true
    gt_top = max(journey.ground_truth_credit, key=journey.ground_truth_credit.get)
    pred_top = max(
        attribution.touchpoint_attributions, key=lambda a: a.credit
    ).index
    return gt_top == pred_top


def _per_channel_credit(
    journeys: list[Journey], attributions: list[JourneyAttribution]
) -> dict[str, float]:
    """Total predicted credit assigned to each channel across the eval set —
    useful for the cockpit display ('AI-chat sponsored answers got 38% of credit')."""
    totals: dict[str, float] = {}
    for j, a in zip(journeys, attributions, strict=True):
        for ta in a.touchpoint_attributions:
            ch = j.touchpoints[ta.index].channel
            totals[ch] = totals.get(ch, 0.0) + ta.credit
    grand_total = sum(totals.values()) or 1e-9
    return {ch: round(v / grand_total, 4) for ch, v in totals.items()}


def _expected_calibration_error(
    journeys: list[Journey],
    attributions: list[JourneyAttribution],
    n_bins: int = 10,
) -> tuple[float, list[dict]]:
    """ECE: for each confidence bin, |mean confidence − mean accuracy|, weighted
    by bin size.

    'Accuracy' here = 1 − absolute credit error (per touchpoint), giving a
    [0,1] scalar we can bin against confidence. A well-calibrated model has
    high accuracy when it reports high confidence and vice versa.
    """
    confidences: list[float] = []
    accuracies: list[float] = []
    for j, a in zip(journeys, attributions, strict=True):
        for ta in a.touchpoint_attributions:
            gt = j.ground_truth_credit.get(ta.index, 0.0)
            confidences.append(ta.confidence)
            accuracies.append(1.0 - min(1.0, abs(ta.credit - gt)))

    if not confidences:
        return 0.0, []

    confidences_arr = np.array(confidences)
    accuracies_arr = np.array(accuracies)

    bin_edges = np.linspace(0.0, 1.0, n_bins + 1)
    bins: list[dict] = []
    weighted_gap = 0.0
    for i in range(n_bins):
        lo, hi = bin_edges[i], bin_edges[i + 1]
        in_bin = (confidences_arr >= lo) & (confidences_arr < (hi if i < n_bins - 1 else hi + 1e-9))
        if in_bin.sum() == 0:
            bins.append({"lo": float(lo), "hi": float(hi), "n": 0, "mean_conf": None, "mean_acc": None})
            continue
        mean_conf = float(confidences_arr[in_bin].mean())
        mean_acc = float(accuracies_arr[in_bin].mean())
        n = int(in_bin.sum())
        bins.append({"lo": float(lo), "hi": float(hi), "n": n, "mean_conf": mean_conf, "mean_acc": mean_acc})
        weighted_gap += (n / len(confidences_arr)) * abs(mean_conf - mean_acc)

    return float(weighted_gap), bins


# --------------------------------------------------------------------------- #
# Reliability diagram
# --------------------------------------------------------------------------- #


def _plot_calibration(bins: list[dict], out_path: Path, title: str) -> None:
    fig, ax = plt.subplots(figsize=(6.5, 5.5))
    ax.plot([0, 1], [0, 1], linestyle="--", color="grey", label="perfect calibration")
    centres, accs, sizes = [], [], []
    for b in bins:
        if b["n"] > 0:
            centres.append((b["lo"] + b["hi"]) / 2)
            accs.append(b["mean_acc"])
            sizes.append(b["n"])
    if centres:
        sizes_norm = [40 + 4 * s for s in sizes]
        ax.scatter(centres, accs, s=sizes_norm, alpha=0.85, color="#3b82f6", label="bin (size ∝ n)")
        for c, a in zip(centres, accs, strict=True):
            ax.plot([c, c], [c, a], linestyle=":", color="#3b82f6", alpha=0.4)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_xlabel("Model confidence")
    ax.set_ylabel("Empirical accuracy (1 − credit error)")
    ax.set_title(title)
    ax.legend(loc="lower right")
    ax.grid(True, alpha=0.2)
    fig.tight_layout()
    fig.savefig(out_path, dpi=130)
    plt.close(fig)


# --------------------------------------------------------------------------- #
# Main runner
# --------------------------------------------------------------------------- #


async def run_eval(*, n_test: int | None = None, regenerate: bool = False) -> dict:
    """Run the full eval, return a summary dict and write artefacts to disk."""
    if regenerate or not (DATA_DIR_ATTR / "journeys.jsonl").exists():
        log.info("regenerating journey dataset")
        save_dataset(generate_dataset(n=500, seed=42))

    journeys = load_dataset()
    _, test = split(journeys, test_frac=0.20, seed=13)
    if n_test is not None:
        test = test[:n_test]
    converters_test = [j for j in test if j.converted]

    log.info(
        "eval: total=%d test=%d converters_in_test=%d",
        len(journeys), len(test), len(converters_test),
    )

    started = time.perf_counter()

    # Our model — LLM-as-judge
    ours = await attribute_many(test, concurrency=6)
    # Last-touch baseline — no LLM, instant
    baseline = [last_touch_attribution(j) for j in test]

    elapsed_s = time.perf_counter() - started

    # Metrics — focused on CONVERTERS (non-converters are trivially zero-credit
    # for both models, so they'd dilute the comparison toward parity).
    def _mean_mae(model_attrs: list[JourneyAttribution]) -> float:
        per_journey = []
        for j, a in zip(test, model_attrs, strict=True):
            if not j.converted:
                continue
            per_journey.append(_credit_mae(j, a))
        return float(np.mean(per_journey)) if per_journey else 0.0

    def _top_match_rate(model_attrs: list[JourneyAttribution]) -> float:
        matches = sum(1 for j, a in zip(test, model_attrs, strict=True) if j.converted and _top_channel_match(j, a))
        n = len(converters_test) or 1
        return round(matches / n, 4)

    ours_mae = _mean_mae(ours)
    baseline_mae = _mean_mae(baseline)
    ours_top = _top_match_rate(ours)
    baseline_top = _top_match_rate(baseline)
    ece, bins = _expected_calibration_error(
        [j for j in test if j.converted],
        [a for j, a in zip(test, ours, strict=True) if j.converted],
        n_bins=10,
    )
    per_channel = _per_channel_credit(test, ours)
    per_channel_baseline = _per_channel_credit(test, baseline)

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = EVAL_RUNS_DIR / ts
    run_dir.mkdir(parents=True, exist_ok=True)

    plot_path = run_dir / "calibration.png"
    _plot_calibration(bins, plot_path, "Aetheric — Reliability Diagram (LLM-as-Judge)")

    summary = {
        "timestamp_utc": ts,
        "n_total": len(journeys),
        "n_test": len(test),
        "n_test_converters": len(converters_test),
        "elapsed_seconds": round(elapsed_s, 1),
        "metrics": {
            "ours": {
                "credit_mae": round(ours_mae, 4),
                "top_touchpoint_match_rate": ours_top,
                "expected_calibration_error": round(ece, 4),
            },
            "last_touch_baseline": {
                "credit_mae": round(baseline_mae, 4),
                "top_touchpoint_match_rate": baseline_top,
            },
            "improvement_vs_baseline": {
                "credit_mae_ratio_better": round(baseline_mae / ours_mae, 2) if ours_mae > 0 else None,
                "credit_mae_absolute_reduction": round(baseline_mae - ours_mae, 4),
                "top_match_rate_lift": round(ours_top - baseline_top, 4),
            },
        },
        "per_channel_credit_share": {
            "ours": per_channel,
            "last_touch": per_channel_baseline,
        },
        "calibration_bins": bins,
        "dataset_summary": summary_stats(journeys),
        "plot_path": str(plot_path.relative_to(DATA_DIR_ATTR.parent.parent)),
    }

    summary_path = run_dir / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2))

    # Convenience symlink/copy: latest_run/ always points at this run
    latest = EVAL_RUNS_DIR / "latest"
    if latest.exists():
        if latest.is_symlink() or latest.is_file():
            latest.unlink()
        else:
            import shutil
            shutil.rmtree(latest)
    try:
        latest.symlink_to(run_dir.name, target_is_directory=True)
    except OSError:
        import shutil
        shutil.copytree(run_dir, latest)

    log.info("eval done: ours_mae=%.4f baseline_mae=%.4f", ours_mae, baseline_mae)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=50, help="number of test journeys to evaluate")
    parser.add_argument("--regen", action="store_true", help="regenerate the journey dataset before eval")
    args = parser.parse_args()

    logging.basicConfig(level="INFO", format="%(asctime)s %(levelname)s %(name)s — %(message)s")
    summary = asyncio.run(run_eval(n_test=args.n, regenerate=args.regen))

    m = summary["metrics"]
    imp = m["improvement_vs_baseline"]
    print()
    print(f"Aetheric Attribution Eval — {summary['timestamp_utc']}")
    print(f"  test set: {summary['n_test']} journeys ({summary['n_test_converters']} converters)")
    print(f"  elapsed:  {summary['elapsed_seconds']}s")
    print()
    print(f"  Credit MAE (ours):           {m['ours']['credit_mae']}")
    print(f"  Credit MAE (last-touch):     {m['last_touch_baseline']['credit_mae']}")
    print(f"  → {imp['credit_mae_ratio_better']}× better than last-touch")
    print()
    print(f"  Top-touchpoint match (ours):       {m['ours']['top_touchpoint_match_rate']}")
    print(f"  Top-touchpoint match (last-touch): {m['last_touch_baseline']['top_touchpoint_match_rate']}")
    print()
    print(f"  Expected calibration error: {m['ours']['expected_calibration_error']}")
    print(f"  Plot saved: {summary['plot_path']}")


if __name__ == "__main__":
    main()
