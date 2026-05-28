import { useMemo } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { EvalSummary } from "@/components/cockpit/HeroBar";
import { channelLabel } from "@/lib/channels";

interface RevealPanelProps {
  evalSummary: EvalSummary | null;
  portfolioRevenue: number;
}

interface ChannelGap {
  channel: string;
  ours: number;
  lastTouch: number;
  gap: number; // ours - lastTouch
}

function gbp(n: number): string {
  return n.toLocaleString("en-GB", { maximumFractionDigits: 0 });
}

export function RevealPanel({ evalSummary, portfolioRevenue }: RevealPanelProps) {
  const shares = evalSummary?.per_channel_credit_share;

  const { rows, misattributedPct, maxShare } = useMemo(() => {
    const ours = shares?.ours ?? {};
    const lastTouch = shares?.last_touch ?? {};
    const channels = new Set([...Object.keys(ours), ...Object.keys(lastTouch)]);
    const rows: ChannelGap[] = [];
    for (const ch of channels) {
      const o = ours[ch] ?? 0;
      const lt = lastTouch[ch] ?? 0;
      rows.push({ channel: ch, ours: o, lastTouch: lt, gap: o - lt });
    }
    rows.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
    // Share of credit last-touch points at the wrong channels.
    const misattributedPct = rows.reduce(
      (acc, r) => acc + Math.max(0, r.lastTouch - r.ours),
      0,
    );
    const maxShare = Math.max(
      0.01,
      ...rows.map((r) => Math.max(r.ours, r.lastTouch)),
    );
    return { rows, misattributedPct, maxShare };
  }, [shares]);

  if (!shares || rows.length === 0) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/20 p-4">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-widest text-foreground">
          Last-touch vs. reality
        </h2>
        <div className="flex flex-1 items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span className="font-mono text-[11px] uppercase tracking-widest">
            awaiting eval summary…
          </span>
        </div>
      </section>
    );
  }

  const misattributedGbp = misattributedPct * portfolioRevenue;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border/60 bg-card/20 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-400" />
        <div>
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-widest text-foreground">
            Last-touch is fooling you
          </h2>
          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
            Last-touch credits the final click, not the cause. Across these
            conversions it points{" "}
            <span className="font-semibold text-rose-300">
              ~£{gbp(misattributedGbp)}
            </span>{" "}
            of credit at the wrong channels.
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-rose-500/70" />
          Last-touch
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-gradient-to-r from-cyan-400 to-indigo-400" />
          TrueTouch
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const overCredited = r.gap < -0.02; // last-touch inflates this channel
          const underCredited = r.gap > 0.02; // last-touch misses this channel
          return (
            <div key={r.channel} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-foreground/80">
                  {channelLabel(r.channel)}
                </span>
                {overCredited && (
                  <span className="rounded bg-rose-500/15 px-1.5 py-px font-mono text-[8.5px] uppercase tracking-wider text-rose-300">
                    over-credited by {Math.round(-r.gap * 100)}pts
                  </span>
                )}
                {underCredited && (
                  <span className="rounded bg-cyan-500/15 px-1.5 py-px font-mono text-[8.5px] uppercase tracking-wider text-cyan-300">
                    under-credited by {Math.round(r.gap * 100)}pts
                  </span>
                )}
              </div>
              {/* Last-touch bar */}
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/60">
                  <div
                    className="h-full rounded-full bg-rose-500/70"
                    style={{ width: `${(r.lastTouch / maxShare) * 100}%` }}
                  />
                </div>
                <span className="w-9 text-right font-mono text-[9.5px] tabular-nums text-rose-300/90">
                  {Math.round(r.lastTouch * 100)}%
                </span>
              </div>
              {/* TrueTouch bar */}
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/60">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400"
                    style={{ width: `${(r.ours / maxShare) * 100}%` }}
                  />
                </div>
                <span className="w-9 text-right font-mono text-[9.5px] tabular-nums text-cyan-200/90">
                  {Math.round(r.ours * 100)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
