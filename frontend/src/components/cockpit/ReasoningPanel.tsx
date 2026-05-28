import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Wrench,
  MessageSquare,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  Event,
  AgentThinkingData,
  AgentMessageData,
  ToolCallProposed,
  ToolCallExecuted,
  Risk,
} from "@/types/protocol";

interface ReasoningPanelProps {
  events: Event[];
}

function riskBadgeClasses(risk: Risk): string {
  if (risk === "low")
    return "border-emerald-500/40 text-emerald-400 bg-emerald-500/10";
  if (risk === "medium")
    return "border-amber-500/40 text-amber-400 bg-amber-500/10";
  return "border-red-500/40 text-red-400 bg-red-500/10";
}

function formatInputLine(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (entries.length === 0) return "(no args)";
  return entries
    .map(([k, v]) => {
      let s: string;
      if (typeof v === "string") s = v.length > 28 ? v.slice(0, 25) + "…" : v;
      else s = typeof v === "object" ? JSON.stringify(v) : String(v);
      return `${k}=${s}`;
    })
    .join(" · ");
}

/**
 * Tool-specific one-line summaries of executed tool results. If the parser
 * recognises the tool, we render a clean human-readable headline; the raw
 * JSON sits behind a click-to-expand. If unrecognised, we just truncate.
 */
function summariseToolOutput(toolName: string, raw: string): {
  headline: string;
  hasJson: boolean;
  parsed: unknown | null;
} {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { headline: raw.length > 120 ? raw.slice(0, 117) + "…" : raw, hasJson: false, parsed: null };
  }

  const p = parsed as Record<string, unknown>;

  if (toolName === "get_eval_summary" && p?.metrics) {
    const m = p.metrics as {
      ours?: { credit_mae?: number; top_touchpoint_match_rate?: number; expected_calibration_error?: number };
      last_touch_baseline?: { credit_mae?: number };
      improvement_vs_baseline?: { credit_mae_ratio_better?: number };
    };
    const mae = m.ours?.credit_mae;
    const baseMae = m.last_touch_baseline?.credit_mae;
    const ratio = m.improvement_vs_baseline?.credit_mae_ratio_better;
    const top = m.ours?.top_touchpoint_match_rate;
    const ece = m.ours?.expected_calibration_error;
    const headline = `MAE ${mae} vs ${baseMae} · ${ratio}× better · top-match ${Math.round((top ?? 0) * 100)}% · ECE ${ece}`;
    return { headline, hasJson: true, parsed };
  }

  if (toolName === "attribute_journey") {
    const top = p.top_credit_channel;
    const breakdown = (p.touchpoint_breakdown ?? p.touchpoints) as
      | { credit?: number; channel?: string }[]
      | undefined;
    const n = breakdown?.length ?? 0;
    const uncertain = p.is_uncertain ? " · UNCERTAIN" : "";
    const lowConf = p.n_low_confidence_touchpoints ?? 0;
    const lowFlag = (lowConf as number) > 0 ? ` · ${lowConf} low-conf` : "";
    return {
      headline: `journey ${p.journey_id} · ${n} touchpoints · top ${top}${lowFlag}${uncertain}`,
      hasJson: true,
      parsed,
    };
  }

  if (toolName === "list_journeys") {
    const list = p.journeys as { journey_id?: string }[] | undefined;
    return {
      headline: `${p.count ?? list?.length ?? 0} journeys · ${list?.slice(0, 3).map((j) => j.journey_id).join(", ") ?? ""}`,
      hasJson: true,
      parsed,
    };
  }

  if (toolName === "load_journey") {
    const tps = p.touchpoints as unknown[] | undefined;
    return {
      headline: `${p.journey_id} loaded · ${tps?.length ?? 0} touchpoints · converted=${p.converted}`,
      hasJson: true,
      parsed,
    };
  }

  if (toolName === "propose_budget_shift" && p.executed) {
    const e = p.executed as { from?: string; to?: string; amount_gbp?: number };
    return {
      headline: `executed · £${e.amount_gbp} ${e.from} → ${e.to}`,
      hasJson: true,
      parsed,
    };
  }

  if (toolName === "tavily_search") {
    const ans = (p.answer ?? "").toString();
    const results = (p.results as unknown[] | undefined)?.length ?? 0;
    return {
      headline: `${results} results · ${ans.length > 100 ? ans.slice(0, 97) + "…" : ans}`,
      hasJson: true,
      parsed,
    };
  }

  // Generic fallback: stringify first 100 chars
  const short = raw.length > 120 ? raw.slice(0, 117) + "…" : raw;
  return { headline: short, hasJson: true, parsed };
}

function CollapsibleJson({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false);
  if (value === null || value === undefined) return null;
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {open ? "hide payload" : "show payload"}
      </button>
      {open && (
        <pre className="mt-1.5 max-h-80 overflow-auto rounded border border-border/50 bg-background/60 p-2 font-mono text-[10.5px] leading-tight text-foreground/80">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function ReasoningPanel({ events }: ReasoningPanelProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(
    () =>
      events.filter((e) =>
        [
          "agent.thinking",
          "agent.message",
          "agent.tool_call_proposed",
          "agent.tool_call_executed",
          "agent.complete",
        ].includes(e.type),
      ),
    [events],
  );

  useEffect(() => {
    const viewport = bottomRef.current?.closest(
      "[data-slot=scroll-area-viewport]",
    ) as HTMLElement | null;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [items.length]);

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-2 p-3">
        {items.length === 0 ? (
          <div className="py-12 text-center font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Agent has not started reasoning yet.
          </div>
        ) : (
          items.map((e) => {
            if (e.type === "agent.thinking") {
              const d = e.data as unknown as AgentThinkingData;
              return (
                <div
                  key={e.id}
                  className="flex gap-2.5 rounded-md border border-sky-500/20 bg-sky-500/[0.04] px-3 py-2"
                >
                  <Brain className="mt-0.5 size-3.5 shrink-0 text-sky-400" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 font-mono text-[10px] uppercase tracking-widest text-sky-400">
                      thinking
                    </div>
                    <div className="text-[12.5px] leading-snug text-foreground/90 whitespace-pre-wrap">
                      {d.text}
                    </div>
                  </div>
                </div>
              );
            }
            if (e.type === "agent.message") {
              const d = e.data as unknown as AgentMessageData;
              return (
                <div
                  key={e.id}
                  className="flex gap-2.5 rounded-md border border-indigo-500/30 bg-indigo-500/[0.06] px-3 py-2"
                >
                  <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-indigo-400" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 font-mono text-[10px] uppercase tracking-widest text-indigo-400">
                      agent says
                    </div>
                    <div className="text-[13px] leading-snug text-foreground whitespace-pre-wrap">
                      {d.text}
                    </div>
                  </div>
                </div>
              );
            }
            if (e.type === "agent.tool_call_proposed") {
              const d = e.data as unknown as ToolCallProposed;
              return (
                <div
                  key={e.id}
                  className="rounded-md border border-violet-500/30 bg-violet-500/[0.04] px-3 py-2"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Wrench className="size-3.5 text-violet-400" />
                    <span className="font-mono text-[10px] uppercase tracking-widest text-violet-400">
                      proposed
                    </span>
                    <span className="font-mono text-[12px] font-semibold text-foreground">
                      {d.tool_name}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-4 px-1.5 font-mono text-[9px] uppercase tracking-wider",
                        riskBadgeClasses(d.risk),
                      )}
                    >
                      {d.risk}
                    </Badge>
                  </div>
                  <div className="font-mono text-[11px] text-foreground/75 break-words">
                    {formatInputLine(d.tool_input)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {d.risk_reason}
                  </div>
                </div>
              );
            }
            if (e.type === "agent.tool_call_executed") {
              const d = e.data as unknown as ToolCallExecuted;
              const { headline, hasJson, parsed } = summariseToolOutput(
                d.tool_name,
                d.output_preview,
              );
              return (
                <div
                  key={e.id}
                  className={cn(
                    "flex gap-2.5 rounded-md border px-3 py-2",
                    d.is_error
                      ? "border-red-500/30 bg-red-500/[0.05]"
                      : "border-emerald-500/30 bg-emerald-500/[0.04]",
                  )}
                >
                  {d.is_error ? (
                    <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-400" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-2">
                      <span
                        className={cn(
                          "font-mono text-[10px] uppercase tracking-widest",
                          d.is_error ? "text-red-400" : "text-emerald-400",
                        )}
                      >
                        executed
                      </span>
                      <span className="font-mono text-[12px] font-semibold text-foreground">
                        {d.tool_name}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {d.duration_ms}ms
                      </span>
                    </div>
                    <div className="text-[12px] leading-snug text-foreground/85 break-words">
                      {headline}
                    </div>
                    {hasJson && <CollapsibleJson value={parsed} />}
                  </div>
                </div>
              );
            }
            if (e.type === "agent.complete") {
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/[0.08] px-3 py-2"
                >
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                  <span className="font-mono text-[11px] uppercase tracking-widest text-emerald-300">
                    Agent run complete
                  </span>
                </div>
              );
            }
            return null;
          })
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
