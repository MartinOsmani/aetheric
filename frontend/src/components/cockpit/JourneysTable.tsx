import { Users, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { channelLabel } from "@/lib/channels";
import type {
  JourneyRow,
  JourneyDetail,
  AttribStatus,
} from "@/lib/console-types";

interface JourneysTableProps {
  rows: JourneyRow[];
  details: Map<string, JourneyDetail>;
  status: Map<string, AttribStatus>;
  selectedId: string | null;
  onSelect: (journeyId: string) => void;
}

function gbp(n: number): string {
  return n.toLocaleString("en-GB", { maximumFractionDigits: 0 });
}

function segmentLabel(seg?: string): string {
  if (!seg) return "—";
  return seg.replace(/_/g, " ");
}

export function JourneysTable({
  rows,
  details,
  status,
  selectedId,
  onSelect,
}: JourneysTableProps) {
  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-border/60 bg-card/20">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-cyan-400" />
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-widest text-foreground">
            Conversions · attribution book
          </h2>
        </div>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {rows.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="font-mono text-[11px] uppercase tracking-widest">
              awaiting list_journeys…
            </span>
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
              <tr className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-2 py-2 text-right font-medium">Revenue</th>
                <th className="px-2 py-2 text-right font-medium">TPs</th>
                <th className="px-2 py-2 font-medium text-rose-300/80">
                  Last-touch says
                </th>
                <th className="px-2 py-2 font-medium text-cyan-300/80">
                  TrueTouch says
                </th>
                <th className="px-2 py-2 pr-4 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const detail = details.get(r.journey_id);
                const st = status.get(r.journey_id) ?? "pending";
                const selected = r.journey_id === selectedId;
                const ours = detail?.top_credit_channel ?? null;
                return (
                  <tr
                    key={r.journey_id}
                    onClick={() => onSelect(r.journey_id)}
                    className={cn(
                      "cursor-pointer border-b border-border/20 transition last:border-b-0 hover:bg-muted/30",
                      selected && "bg-indigo-500/10 hover:bg-indigo-500/15",
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-[11px] text-foreground">
                        {r.journey_id}
                      </div>
                      <div className="text-[10.5px] capitalize text-muted-foreground">
                        {segmentLabel(r.user_segment)}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono text-[11px] tabular-nums text-foreground">
                      £{gbp(r.revenue)}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                      {r.n_touchpoints}
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] text-rose-200/90">
                        {channelLabel(r.last_channel)}{" "}
                        <span className="text-rose-300/60">100%</span>
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      {ours ? (
                        <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] text-cyan-200/90">
                          {channelLabel(ours)}
                          {detail?.is_uncertain && (
                            <span className="ml-1 text-amber-300/80">⚠</span>
                          )}
                        </span>
                      ) : st === "attributing" ? (
                        <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" />
                          attributing…
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-muted-foreground/50">
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 pr-4 text-right">
                      <ChevronRight
                        className={cn(
                          "ml-auto size-3.5 text-muted-foreground/50",
                          selected && "text-indigo-300",
                        )}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
