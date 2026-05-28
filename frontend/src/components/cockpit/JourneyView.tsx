import { useMemo } from "react";
import {
  GitBranch,
  MessageSquare,
  Sparkles,
  Search,
  Headphones,
  ImageIcon,
  Globe,
  AlertTriangle,
} from "lucide-react";
import type { Event, PlaybookEventData } from "@/types/protocol";

interface JourneyViewProps {
  events: Event[];
}

type Touchpoint = {
  index: number;
  channel: string;
  minutes_offset: number;
  content_hint?: string;
  channel_description?: string;
  credit?: number;
  confidence?: number;
  low_confidence?: boolean;
  reason?: string;
};

type Journey = {
  journey_id: string;
  user_segment?: string;
  converted: boolean;
  revenue_if_converted?: number;
  touchpoints: Touchpoint[];
  top_credit_channel?: string | null;
  is_uncertain?: boolean;
  attribution_in_play: boolean; // true once credit_assigned arrived
};

const CHANNEL_META: Record<
  string,
  { label: string; icon: React.ElementType; accent: string }
> = {
  ai_chat_sponsored_answer: {
    label: "AI chat sponsored answer",
    icon: MessageSquare,
    accent: "from-indigo-500 to-fuchsia-500",
  },
  prompt_aware_native: {
    label: "Prompt-aware native",
    icon: Sparkles,
    accent: "from-cyan-400 to-sky-500",
  },
  sponsored_autocomplete: {
    label: "Sponsored autocomplete",
    icon: Search,
    accent: "from-teal-400 to-emerald-500",
  },
  podcast_readout: {
    label: "Podcast readout",
    icon: Headphones,
    accent: "from-amber-400 to-orange-500",
  },
  display_retargeting: {
    label: "Display retargeting",
    icon: ImageIcon,
    accent: "from-pink-500 to-rose-500",
  },
  organic_search: {
    label: "Organic search",
    icon: Globe,
    accent: "from-zinc-400 to-zinc-500",
  },
};

function isPlaybookEvent(e: Event): e is Event & { data: PlaybookEventData } {
  return e.type === "playbook.event";
}

function useCurrentJourney(events: Event[]): Journey | null {
  return useMemo(() => {
    // Find latest journey_loaded
    let loaded: PlaybookEventData | null = null;
    let credit: PlaybookEventData | null = null;
    for (const e of events) {
      if (!isPlaybookEvent(e)) continue;
      const pl = e.data;
      if (pl.playbook !== "attribution") continue;
      if (pl.name === "journey_loaded") {
        loaded = pl;
        credit = null; // credits for a previous journey no longer apply
      } else if (pl.name === "credit_assigned") {
        credit = pl;
      }
    }

    if (credit) {
      const p = credit.payload as {
        journey_id: string;
        converted: boolean;
        touchpoints: Touchpoint[];
        top_credit_channel?: string | null;
        is_uncertain?: boolean;
      };
      return {
        journey_id: p.journey_id,
        converted: p.converted,
        touchpoints: p.touchpoints,
        top_credit_channel: p.top_credit_channel,
        is_uncertain: p.is_uncertain,
        attribution_in_play: true,
      };
    }
    if (loaded) {
      const p = loaded.payload as {
        journey_id: string;
        user_segment?: string;
        converted: boolean;
        revenue_if_converted?: number;
        touchpoints: Touchpoint[];
      };
      return {
        journey_id: p.journey_id,
        user_segment: p.user_segment,
        converted: p.converted,
        revenue_if_converted: p.revenue_if_converted,
        touchpoints: p.touchpoints,
        attribution_in_play: false,
      };
    }
    return null;
  }, [events]);
}

export function JourneyView({ events }: JourneyViewProps) {
  const journey = useCurrentJourney(events);

  if (!journey) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-cyan-400" />
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-widest text-foreground">
            Attribution · journey view
          </h3>
        </div>
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border/60 bg-card/20">
          <div className="text-center text-muted-foreground">
            <p className="font-mono text-[11px] uppercase tracking-widest">
              No journey loaded yet
            </p>
            <p className="mt-2 text-[12px]">
              Ask the agent to <code className="rounded bg-muted px-1.5 py-0.5 font-mono">load_journey</code>{" "}
              and <code className="rounded bg-muted px-1.5 py-0.5 font-mono">attribute_journey</code>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Aggregate credit by channel for the side legend
  const byChannel: Record<string, number> = {};
  for (const tp of journey.touchpoints) {
    if (tp.credit !== undefined) {
      byChannel[tp.channel] = (byChannel[tp.channel] ?? 0) + tp.credit;
    }
  }
  const channelTotals = Object.entries(byChannel)
    .sort(([, a], [, b]) => b - a);

  // Find the top-credit touchpoint by credit value
  let maxCredit = 0;
  for (const tp of journey.touchpoints) {
    if ((tp.credit ?? 0) > maxCredit) maxCredit = tp.credit!;
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-cyan-400" />
          <div>
            <h3 className="font-mono text-[11px] font-medium uppercase tracking-widest text-foreground">
              Attribution · {journey.journey_id}
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {journey.user_segment && (
                <>
                  <span className="font-mono">{journey.user_segment}</span>
                  <span className="mx-2">·</span>
                </>
              )}
              <span
                className={
                  journey.converted ? "text-emerald-400" : "text-muted-foreground"
                }
              >
                {journey.converted ? "converted" : "no conversion"}
              </span>
              {journey.converted && journey.revenue_if_converted ? (
                <>
                  <span className="mx-2">·</span>
                  <span className="tabular-nums">£{journey.revenue_if_converted.toFixed(0)}</span>
                </>
              ) : null}
              <span className="mx-2">·</span>
              <span className="tabular-nums">{journey.touchpoints.length} touchpoints</span>
            </p>
          </div>
        </div>
        {journey.is_uncertain && (
          <div className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1">
            <AlertTriangle className="size-3 text-amber-400" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-amber-300">
              uncertain attribution
            </span>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Touchpoint list */}
        <div className="flex-1 overflow-y-auto rounded-md border border-border/60 bg-card/30 p-3">
          <div className="flex flex-col gap-2">
            {journey.touchpoints.map((tp) => {
              const meta = CHANNEL_META[tp.channel] ?? {
                label: tp.channel,
                icon: GitBranch,
                accent: "from-zinc-400 to-zinc-600",
              };
              const Icon = meta.icon;
              const credit = tp.credit ?? null;
              const conf = tp.confidence ?? null;
              const isTop =
                credit !== null && credit > 0 && credit === maxCredit;
              const confColor =
                conf === null
                  ? "text-muted-foreground"
                  : conf >= 0.7
                    ? "text-emerald-400"
                    : conf >= 0.5
                      ? "text-amber-400"
                      : "text-red-400";

              return (
                <div
                  key={tp.index}
                  className={
                    "flex items-start gap-3 rounded border bg-background/60 px-3 py-2.5 transition " +
                    (isTop
                      ? "border-fuchsia-500/60 shadow-[0_0_0_1px_rgba(217,70,239,0.18)]"
                      : "border-border/40")
                  }
                >
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
                    {String(tp.index + 1).padStart(2, "0")}
                  </div>
                  <Icon className="mt-0.5 size-4 shrink-0 text-cyan-400" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] uppercase tracking-wider text-cyan-300">
                        {meta.label}
                      </span>
                      {isTop && (
                        <span className="rounded bg-fuchsia-500/15 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-fuchsia-300">
                          top credit
                        </span>
                      )}
                      {tp.low_confidence && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-amber-300">
                          low conf
                        </span>
                      )}
                      <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
                        t+{tp.minutes_offset.toFixed(0)}m
                      </span>
                    </div>
                    {tp.content_hint && (
                      <p className="mt-1 text-[12px] text-foreground/80">{tp.content_hint}</p>
                    )}
                    {tp.reason && (
                      <p className="mt-1 text-[11px] italic text-muted-foreground">
                        “{tp.reason}”
                      </p>
                    )}
                    {credit !== null && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${meta.accent}`}
                            style={{ width: `${Math.min(100, credit * 100)}%` }}
                          />
                        </div>
                        <span className="w-12 text-right font-mono text-[10px] tabular-nums text-foreground">
                          {(credit * 100).toFixed(1)}%
                        </span>
                        {conf !== null && (
                          <span
                            className={`w-12 text-right font-mono text-[10px] tabular-nums ${confColor}`}
                          >
                            ±{((1 - conf) * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Side legend: aggregate credit per channel */}
        {channelTotals.length > 0 && (
          <div className="w-56 shrink-0 rounded-md border border-border/60 bg-card/30 p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Aggregate credit
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {channelTotals.map(([ch, total]) => {
                const meta = CHANNEL_META[ch] ?? {
                  label: ch,
                  icon: GitBranch,
                  accent: "from-zinc-400 to-zinc-600",
                };
                return (
                  <div key={ch} className="text-[11px]">
                    <div className="flex justify-between gap-2">
                      <span className="truncate font-mono text-[10px] uppercase tracking-wider text-foreground/80">
                        {meta.label}
                      </span>
                      <span className="font-mono tabular-nums text-foreground">
                        {(total * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${meta.accent}`}
                        style={{ width: `${Math.min(100, total * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {!journey.attribution_in_play && (
              <p className="mt-3 text-[10px] italic text-muted-foreground">
                Awaiting <code className="font-mono">attribute_journey</code>…
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
