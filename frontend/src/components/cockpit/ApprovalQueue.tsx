import { AlertTriangle, ArrowRight, Check, X } from "lucide-react";
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

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value);
}

/**
 * Render `propose_budget_shift` with a distinctive "from → to" hero block
 * so the demo punch-line beat reads instantly. Other tools fall back to a
 * generic key/value list.
 */
function PendingDetail({ name, input }: { name: string; input: Record<string, unknown> }) {
  if (name === "propose_budget_shift") {
    const from = formatValue(input.from_channel);
    const to = formatValue(input.to_channel);
    const amount = formatValue(input.amount);
    const reason = formatValue(input.reason);
    return (
      <div className="space-y-2.5">
        <div className="rounded-md border border-red-500/30 bg-background/60 p-2.5">
          <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            Spend reallocation
          </div>
          <div className="mt-1.5 flex flex-col gap-1 text-[11.5px]">
            <div className="flex items-center gap-1.5 font-mono text-foreground">
              <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10.5px]">{from}</span>
              <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10.5px] text-emerald-300">
                {to}
              </span>
            </div>
            <div className="font-mono text-[14px] font-semibold text-foreground tabular-nums">
              £{amount}<span className="text-[10px] font-normal text-muted-foreground">/day</span>
            </div>
          </div>
        </div>
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            Agent's reason
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-foreground/85">{reason}</p>
        </div>
      </div>
    );
  }

  // Generic — render every input field as a key/value row.
  const entries = Object.entries(input);
  if (entries.length === 0) {
    return (
      <div className="font-mono text-[10.5px] italic text-muted-foreground">
        (no input arguments)
      </div>
    );
  }
  return (
    <dl className="space-y-1.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex flex-col">
          <dt className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            {k}
          </dt>
          <dd className="break-words text-[11.5px] leading-snug text-foreground/90">
            {formatValue(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
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
                className="relative overflow-hidden rounded-md border border-red-500/40 bg-red-500/[0.04] p-3 shadow-[0_0_24px_-12px_rgb(239_68_68_/_0.7)] animate-[pulse_2.4s_ease-in-out_infinite]"
              >
                <div className="absolute inset-y-0 left-0 w-[3px] bg-red-500" />
                <div className="ml-1.5 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-red-400">
                      High-risk action
                    </span>
                    <Badge
                      variant="outline"
                      className="h-4 border-red-500/40 px-1.5 font-mono text-[9px] uppercase tracking-wider text-red-400"
                    >
                      Awaiting human
                    </Badge>
                  </div>

                  <div className="font-mono text-[13px] font-semibold text-foreground">
                    {p.toolName}
                  </div>

                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {p.riskReason}
                  </p>

                  <div className="rounded border border-border/50 bg-background/40 p-2.5">
                    <PendingDetail name={p.toolName} input={p.toolInput} />
                  </div>

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
