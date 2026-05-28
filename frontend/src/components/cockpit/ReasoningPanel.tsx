import { useEffect, useRef } from "react";
import { Brain, Wrench, MessageSquare, CheckCircle2, XCircle } from "lucide-react";
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

function formatInput(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

export function ReasoningPanel({ events }: ReasoningPanelProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const items = events.filter((e) =>
    [
      "agent.thinking",
      "agent.message",
      "agent.tool_call_proposed",
      "agent.tool_call_executed",
      "agent.complete",
    ].includes(e.type),
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
                    <div className="text-[12.5px] leading-snug text-foreground/90">
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
                    <div className="text-[13px] leading-snug text-foreground">
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
                  <div className="mb-1 flex items-center gap-2">
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
                  <pre className="overflow-x-auto rounded border border-border/60 bg-background/60 p-1.5 font-mono text-[10.5px] leading-tight text-foreground/80">
                    {formatInput(d.tool_input)}
                  </pre>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {d.risk_reason}
                  </div>
                </div>
              );
            }
            if (e.type === "agent.tool_call_executed") {
              const d = e.data as unknown as ToolCallExecuted;
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
                    <pre className="overflow-x-auto rounded border border-border/60 bg-background/60 p-1.5 font-mono text-[10.5px] leading-tight text-foreground/80">
                      {d.output_preview}
                    </pre>
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
