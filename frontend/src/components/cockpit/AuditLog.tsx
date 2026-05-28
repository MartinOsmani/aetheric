import { useEffect, useMemo, useRef, useState } from "react";
import { Activity } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Event } from "@/types/protocol";

interface AuditLogProps {
  events: Event[];
}

/** Buckets for the filter chips. */
type Bucket = "oversight" | "tools" | "reasoning" | "events";

const BUCKET_OF: Record<Event["type"], Bucket> = {
  "session.started": "oversight",
  "session.error": "oversight",
  "oversight.approval_required": "oversight",
  "oversight.approval_resolved": "oversight",
  "oversight.kill_triggered": "oversight",
  "agent.complete": "oversight",
  "agent.tool_call_proposed": "tools",
  "agent.tool_call_executed": "tools",
  "agent.thinking": "reasoning",
  "agent.message": "reasoning",
  "playbook.event": "events",
};

const BUCKET_LABELS: Record<Bucket, string> = {
  oversight: "Oversight",
  tools: "Tools",
  reasoning: "Reasoning",
  events: "Events",
};

function truncate(s: string, n = 90): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function summarise(e: Event): string {
  const d = e.data as Record<string, unknown>;
  switch (e.type) {
    case "session.started":
      return `session started · ${String(d.playbook ?? "")}`;
    case "session.error":
      return `ERROR: ${truncate(String(d.message ?? d.error ?? "unknown"))}`;
    case "agent.thinking":
      return `thinking · ${truncate(String(d.text ?? ""))}`;
    case "agent.message":
      return `message · ${truncate(String(d.text ?? ""))}`;
    case "agent.tool_call_proposed":
      return `proposed ${String(d.tool_name)} · risk=${String(d.risk)}`;
    case "agent.tool_call_executed":
      return `executed ${String(d.tool_name)} · ${String(d.duration_ms ?? 0)}ms${d.is_error ? " · ERROR" : ""}`;
    case "agent.complete":
      return `complete · ${String(d.stop_reason ?? "")}`;
    case "oversight.approval_required":
      return `approval required · ${String(d.tool_name)}`;
    case "oversight.approval_resolved":
      return `${String(d.decision).toUpperCase()} by ${String(d.by)}`;
    case "oversight.kill_triggered":
      return `KILL · ${truncate(String(d.reason ?? "no reason given"))}`;
    case "playbook.event":
      return `playbook ${String(d.name)}`;
    default:
      return truncate(JSON.stringify(d));
  }
}

function typeColor(type: Event["type"]): string {
  switch (type) {
    case "agent.thinking":
      return "text-sky-400";
    case "agent.message":
      return "text-indigo-300";
    case "agent.tool_call_proposed":
      return "text-violet-400";
    case "agent.tool_call_executed":
      return "text-emerald-400";
    case "agent.complete":
      return "text-emerald-300";
    case "oversight.approval_required":
      return "text-red-400";
    case "oversight.approval_resolved":
      return "text-amber-300";
    case "oversight.kill_triggered":
      return "text-red-500";
    case "playbook.event":
      return "text-fuchsia-400";
    case "session.started":
      return "text-indigo-400";
    case "session.error":
      return "text-red-400";
    default:
      return "text-muted-foreground";
  }
}

function shortType(type: Event["type"]): string {
  // Strip the namespace prefix for compactness — full type is still in the audit log file.
  return type.replace(/^(agent|oversight|session|playbook)\./, "");
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    const ss = d.getSeconds().toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  } catch {
    return ts;
  }
}

const STORAGE_KEY = "aetheric.auditFilters.v1";

function loadFilters(): Record<Bucket, boolean> {
  if (typeof window === "undefined") {
    return { oversight: true, tools: true, reasoning: false, events: true };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<Bucket, boolean>;
  } catch {
    /* ignore */
  }
  return { oversight: true, tools: true, reasoning: false, events: true };
}

export function AuditLog({ events }: AuditLogProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [filters, setFilters] = useState<Record<Bucket, boolean>>(() => loadFilters());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      /* ignore */
    }
  }, [filters]);

  const filtered = useMemo(
    () => events.filter((e) => filters[BUCKET_OF[e.type] ?? "events"]),
    [events, filters],
  );

  useEffect(() => {
    const viewport = viewportRef.current?.closest(
      "[data-slot=scroll-area-viewport]",
    ) as HTMLElement | null;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    } else {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [filtered.length]);

  return (
    <aside className="flex h-full flex-col border-l border-border bg-card/20">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-emerald-400" />
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-widest text-foreground">
            Audit Log
          </h2>
        </div>
        <Badge
          variant="outline"
          className="h-5 px-1.5 font-mono text-[10px] tabular-nums"
        >
          {filtered.length}
          {filtered.length !== events.length && (
            <span className="ml-1 text-muted-foreground/70">/{events.length}</span>
          )}
        </Badge>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1 border-b border-border/60 px-2 py-1.5">
        {(Object.keys(BUCKET_LABELS) as Bucket[]).map((b) => {
          const on = filters[b];
          return (
            <button
              key={b}
              type="button"
              onClick={() => setFilters((f) => ({ ...f, [b]: !f[b] }))}
              className={cn(
                "rounded border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-widest transition",
                on
                  ? "border-emerald-500/40 bg-emerald-500/[0.08] text-emerald-300"
                  : "border-border/60 bg-transparent text-muted-foreground hover:text-foreground",
              )}
              title={`${on ? "Hide" : "Show"} ${BUCKET_LABELS[b]} events`}
            >
              {BUCKET_LABELS[b]}
            </button>
          );
        })}
      </div>

      <ScrollArea className="flex-1">
        <div ref={viewportRef} className="flex flex-col px-2 py-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {events.length === 0
                ? "Waiting for events…"
                : "No events match current filters"}
            </div>
          ) : (
            filtered.map((e) => (
              <div
                key={e.id}
                className="group flex gap-2 border-b border-border/20 px-1 py-0.5 font-mono text-[10.5px] leading-snug last:border-b-0 hover:bg-muted/30"
              >
                <span className="shrink-0 tabular-nums text-muted-foreground/60">
                  {formatTime(e.ts)}
                </span>
                <span className={cn("shrink-0 w-[7.5em]", typeColor(e.type))}>
                  {shortType(e.type)}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground/80">
                  {summarise(e)}
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </aside>
  );
}
