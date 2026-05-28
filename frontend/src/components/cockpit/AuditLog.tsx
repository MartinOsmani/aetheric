import { useEffect, useRef } from "react";
import { Activity } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Event } from "@/types/protocol";

interface AuditLogProps {
  events: Event[];
}

function summarise(e: Event): string {
  const d = e.data as Record<string, unknown>;
  switch (e.type) {
    case "session.started":
      return `session ${e.session_id} started${d.playbook ? ` · ${String(d.playbook)}` : ""}${d.goal ? ` · goal: ${String(d.goal)}` : ""}`;
    case "session.error":
      return `error: ${String(d.message ?? "unknown")}`;
    case "agent.thinking":
      return `thinking: ${String(d.text ?? "")}`;
    case "agent.message":
      return `message: ${String(d.text ?? "")}`;
    case "agent.tool_call_proposed":
      return `proposed ${String(d.tool_name)} [risk=${String(d.risk)}] — ${String(d.risk_reason ?? "")}`;
    case "agent.tool_call_executed":
      return `executed ${String(d.tool_name)} (${String(d.duration_ms ?? 0)}ms)${d.is_error ? " ERROR" : ""} — ${String(d.output_preview ?? "")}`;
    case "agent.complete":
      return `complete${d.status ? ` · ${String(d.status)}` : ""}`;
    case "oversight.approval_required":
      return `approval required for ${String(d.tool_name)} — ${String(d.risk_reason ?? "")}`;
    case "oversight.approval_resolved":
      return `approval ${String(d.decision)} by ${String(d.by)} for ${String(d.tool_use_id)}`;
    case "oversight.kill_triggered":
      return `KILL: ${String(d.reason ?? "no reason given")}`;
    case "playbook.event":
      return `playbook ${String(d.name)} ${JSON.stringify(d.payload ?? {})}`;
    default:
      return JSON.stringify(d);
  }
}

function typeColor(type: Event["type"]): string {
  switch (type) {
    case "agent.thinking":
      return "text-sky-400";
    case "agent.message":
      return "text-foreground";
    case "agent.tool_call_proposed":
      return "text-violet-400";
    case "agent.tool_call_executed":
      return "text-emerald-400";
    case "agent.complete":
      return "text-emerald-300";
    case "oversight.approval_required":
      return "text-amber-400";
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

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    const ss = d.getSeconds().toString().padStart(2, "0");
    const ms = d.getMilliseconds().toString().padStart(3, "0");
    return `${hh}:${mm}:${ss}.${ms}`;
  } catch {
    return ts;
  }
}

export function AuditLog({ events }: AuditLogProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Auto-scroll the radix ScrollArea viewport, falling back to the
    // sentinel div if needed.
    const viewport = viewportRef.current?.closest(
      "[data-slot=scroll-area-viewport]",
    ) as HTMLElement | null;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    } else {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [events.length]);

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
          {events.length}
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        <div ref={viewportRef} className="flex flex-col px-2 py-1">
          {events.length === 0 ? (
            <div className="py-8 text-center font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Waiting for events…
            </div>
          ) : (
            events.map((e) => (
              <div
                key={e.id}
                className="group flex gap-2 border-b border-border/30 px-1 py-1 font-mono text-[11px] leading-tight last:border-b-0 hover:bg-muted/30"
              >
                <span className="shrink-0 text-muted-foreground/70">
                  {formatTime(e.ts)}
                </span>
                <span className={cn("shrink-0", typeColor(e.type))}>
                  {e.type}
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
