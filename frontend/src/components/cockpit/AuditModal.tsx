import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Event } from "@/types/protocol";

interface AuditModalProps {
  events: Event[];
  open: boolean;
  onClose: () => void;
}

function truncate(s: string, n = 110): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
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
      return `complete · ${String(d.stop_reason ?? d.status ?? "")}`;
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

export function AuditModal({ events, open, onClose }: AuditModalProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [open, events.length]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="flex h-[80vh] w-[min(92vw,820px)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-emerald-400" />
            <h2 className="font-mono text-xs font-medium uppercase tracking-widest text-foreground">
              Audit log · append-only
            </h2>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {events.length} entries
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
            aria-label="Close audit log"
          >
            <X className="size-4" />
          </button>
        </div>

        <ScrollArea className="flex-1">
          <div className="flex flex-col px-3 py-2">
            {events.length === 0 ? (
              <div className="py-12 text-center font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Waiting for events…
              </div>
            ) : (
              events.map((e) => (
                <div
                  key={e.id}
                  className="group flex gap-3 border-b border-border/20 px-1 py-1 font-mono text-[11px] leading-snug last:border-b-0 hover:bg-muted/30"
                >
                  <span className="shrink-0 tabular-nums text-muted-foreground/60">
                    {formatTime(e.ts)}
                  </span>
                  <span className={cn("w-[9em] shrink-0", typeColor(e.type))}>
                    {shortType(e.type)}
                  </span>
                  <span className="min-w-0 flex-1 text-foreground/80">
                    {summarise(e)}
                  </span>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

export function AuditChip({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 border-t border-border bg-card/30 px-5 py-2 text-left transition hover:bg-card/50"
    >
      <Activity className="size-3.5 text-emerald-400" />
      <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Audit:{" "}
        <span className="tabular-nums text-foreground">{count} entries</span> — open
      </span>
    </button>
  );
}
