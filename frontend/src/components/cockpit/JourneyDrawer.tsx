import { X, ArrowRight } from "lucide-react";
import { JourneyView } from "@/components/cockpit/JourneyView";
import { channelLabel } from "@/lib/channels";
import type { JourneyDetail } from "@/lib/console-types";

interface JourneyDrawerProps {
  journey: JourneyDetail | null;
  // Final-click channel for the row, used before attribution arrives.
  fallbackLastChannel?: string | null;
  open: boolean;
  onClose: () => void;
}

function gbp(n: number): string {
  return n.toLocaleString("en-GB", { maximumFractionDigits: 0 });
}

export function JourneyDrawer({
  journey,
  fallbackLastChannel,
  open,
  onClose,
}: JourneyDrawerProps) {
  if (!open) return null;

  const tps = journey?.touchpoints ?? [];
  const finalChannel =
    tps.length > 0 ? tps[tps.length - 1].channel : fallbackLastChannel ?? null;
  const revenue = journey?.revenue_if_converted ?? 0;

  // TrueTouch's aggregate credit for the channel last-touch hands 100% to.
  let oursForFinalChannel: number | null = null;
  if (journey?.attributed && finalChannel) {
    const sum = tps
      .filter((t) => t.channel === finalChannel && t.credit !== undefined)
      .reduce((acc, t) => acc + (t.credit ?? 0), 0);
    oursForFinalChannel = sum;
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/60 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="dark relative flex h-full w-[min(92vw,760px)] flex-col border-l border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-widest text-foreground">
            Customer detail
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
            aria-label="Close detail"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* The contrast line — "last-touch is fooling you", per customer */}
        <div className="border-b border-border/60 bg-card/30 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              Last-touch
            </span>
            <span className="rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[10px] text-rose-200">
              100% → {channelLabel(finalChannel)}
            </span>
            {oursForFinalChannel !== null && (
              <>
                <ArrowRight className="size-3.5 text-muted-foreground" />
                <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  TrueTouch
                </span>
                <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] text-cyan-200">
                  that channel earned {(oursForFinalChannel * 100).toFixed(0)}%
                </span>
                {revenue > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    — i.e.{" "}
                    <span className="font-mono text-foreground">
                      £{gbp(oursForFinalChannel * revenue)}
                    </span>{" "}
                    of the £{gbp(revenue)} sale, not £{gbp(revenue)}.
                  </span>
                )}
              </>
            )}
            {oursForFinalChannel === null && (
              <span className="text-[11px] italic text-muted-foreground">
                — select-driven; TrueTouch attribution pending.
              </span>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <JourneyView journey={journey} />
        </div>
      </div>
    </div>
  );
}
