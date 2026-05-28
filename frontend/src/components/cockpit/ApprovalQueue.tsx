import { AlertTriangle, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export interface PendingApproval {
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  riskReason: string;
}

interface ApprovalQueueProps {
  pending: PendingApproval[];
  onDecision: (toolUseId: string, decision: "approve" | "deny") => void;
}

function formatInput(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

export function ApprovalQueue({ pending, onDecision }: ApprovalQueueProps) {
  return (
    <aside className="flex h-full flex-col border-r border-border bg-card/20">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-400" />
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-widest text-foreground">
            Approval Queue
          </h2>
        </div>
        <Badge
          variant="outline"
          className="h-5 px-1.5 font-mono text-[10px] tabular-nums"
        >
          {pending.length}
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-3">
          {pending.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-xs text-muted-foreground">
              <div className="size-2 rounded-full bg-muted-foreground/30" />
              <span className="font-mono uppercase tracking-wider">
                No pending approvals
              </span>
              <span className="text-[11px] text-muted-foreground/70">
                High-risk tool calls land here
              </span>
            </div>
          ) : (
            pending.map((p) => (
              <div
                key={p.toolUseId}
                className="relative overflow-hidden rounded-md border border-red-500/40 bg-red-500/[0.03] p-3 shadow-[0_0_24px_-12px_rgb(239_68_68_/_0.6)] animate-[pulse_2.4s_ease-in-out_infinite]"
              >
                <div className="absolute inset-y-0 left-0 w-[3px] bg-red-500" />
                <div className="ml-1">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-red-400">
                      High-risk action
                    </span>
                    <Badge
                      variant="outline"
                      className="h-4 border-red-500/40 px-1.5 font-mono text-[9px] uppercase tracking-wider text-red-400"
                    >
                      Awaiting human
                    </Badge>
                  </div>

                  <div className="mb-2 font-mono text-[13px] font-semibold text-foreground">
                    {p.toolName}
                  </div>

                  <p className="mb-2 text-[12px] leading-snug text-muted-foreground">
                    {p.riskReason}
                  </p>

                  <pre className="mb-3 max-h-32 overflow-auto rounded border border-border/60 bg-background/60 p-2 font-mono text-[10.5px] leading-tight text-foreground/80">
                    {formatInput(p.toolInput)}
                  </pre>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => onDecision(p.toolUseId, "approve")}
                      className="flex-1 gap-1 bg-emerald-600 text-white hover:bg-emerald-500"
                    >
                      <Check className="size-3.5" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => onDecision(p.toolUseId, "deny")}
                      className="flex-1 gap-1"
                    >
                      <X className="size-3.5" />
                      Deny
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
