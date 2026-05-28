import { AlertTriangle, ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PendingApproval {
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  riskReason: string;
}

interface ApprovalModalProps {
  pending: PendingApproval | null;
  onDecision: (toolUseId: string, decision: "approve" | "deny") => void;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value);
}

const CHANNEL_LABELS: Record<string, string> = {
  ai_chat_sponsored_answer: "AI chat sponsored answer",
  prompt_aware_native: "Prompt-aware native",
  sponsored_autocomplete: "Sponsored autocomplete",
  podcast_readout: "Podcast readout",
  display_retargeting: "Display retargeting",
  organic_search: "Organic search",
};

function channelLabel(raw: unknown): string {
  const key = formatValue(raw);
  return CHANNEL_LABELS[key] ?? key;
}

function BudgetShiftDetail({ input }: { input: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-red-500/30 bg-background/60 p-4">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Spend reallocation
        </div>
        <div className="mt-3 flex items-center gap-3 font-mono text-foreground">
          <span className="rounded-md bg-muted/60 px-3 py-1.5 text-sm">
            {channelLabel(input.from_channel)}
          </span>
          <ArrowRight className="size-5 shrink-0 text-muted-foreground" />
          <span className="rounded-md bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-300">
            {channelLabel(input.to_channel)}
          </span>
        </div>
        <div className="mt-3 font-mono text-3xl font-semibold tabular-nums text-foreground">
          £{formatValue(input.amount)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">/day</span>
        </div>
      </div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Agent's reason
        </div>
        <p className="mt-1.5 text-sm leading-snug text-foreground/85">
          {formatValue(input.reason)}
        </p>
      </div>
    </div>
  );
}

function GenericDetail({ input }: { input: Record<string, unknown> }) {
  const entries = Object.entries(input);
  if (entries.length === 0) {
    return (
      <div className="font-mono text-xs italic text-muted-foreground">
        (no input arguments)
      </div>
    );
  }
  return (
    <dl className="space-y-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex flex-col">
          <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {k}
          </dt>
          <dd className="break-words text-sm leading-snug text-foreground/90">
            {formatValue(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ApprovalModal({ pending, onDecision }: ApprovalModalProps) {
  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-[min(92vw,460px)] overflow-hidden rounded-xl border border-red-500/40 bg-card shadow-[0_0_60px_-12px_rgb(239_68_68_/_0.6)]">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-red-500" />
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-red-400" />
              <span className="font-mono text-sm font-semibold uppercase tracking-wider text-red-400">
                High-risk action — approval required
              </span>
            </div>
            <span className="rounded border border-red-500/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-red-400">
              Paused
            </span>
          </div>

          <div className="font-mono text-base font-semibold text-foreground">
            {pending.toolName}
          </div>
          <p className="-mt-2 text-xs leading-snug text-muted-foreground">
            {pending.riskReason}
          </p>

          {pending.toolName === "propose_budget_shift" ? (
            <BudgetShiftDetail input={pending.toolInput} />
          ) : (
            <GenericDetail input={pending.toolInput} />
          )}

          <div className="mt-1 flex gap-3">
            <Button
              onClick={() => onDecision(pending.toolUseId, "approve")}
              className="flex-1 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
            >
              <Check className="size-4" />
              Approve
            </Button>
            <Button
              variant="destructive"
              onClick={() => onDecision(pending.toolUseId, "deny")}
              className="flex-1 gap-1.5"
            >
              <X className="size-4" />
              Deny
            </Button>
          </div>
          <p className="text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Nothing moves until you decide
          </p>
        </div>
      </div>
    </div>
  );
}
