import { Power, Activity, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThroughlineLogo } from "@/components/cockpit/Logo";
import { cn } from "@/lib/utils";
import type { Risk } from "@/types/protocol";

export interface EvalSummary {
  ratio_better?: number | null;
  credit_mae?: number | null;
  last_touch_mae?: number | null;
  top_match_rate?: number | null;
  ece?: number | null;
  per_channel_credit_share?: {
    ours?: Record<string, number>;
    last_touch?: Record<string, number>;
  } | null;
}

interface HeroBarProps {
  evalSummary: EvalSummary | null;
  statusText: string;
  step: number;
  risk: Risk;
  connected: boolean;
  usingMock: boolean;
  killed: boolean;
  busy: boolean;
  onKill: () => void;
}

function riskClasses(risk: Risk): string {
  if (risk === "low")
    return "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30";
  if (risk === "medium")
    return "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30";
  return "bg-red-500/15 text-red-400 ring-1 ring-red-500/30 animate-pulse";
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-md border border-border/60 bg-background/40 px-3 py-1.5">
      <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

export function HeroBar({
  evalSummary,
  statusText,
  step,
  risk,
  connected,
  usingMock,
  killed,
  busy,
  onKill,
}: HeroBarProps) {
  const ratio = evalSummary?.ratio_better;
  const hasNumber = typeof ratio === "number" && Number.isFinite(ratio);

  return (
    <header className="flex flex-col gap-3 border-b border-border bg-card/30 px-5 py-3.5">
      {/* Row 1: brand + headline number + connection/risk/kill */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ThroughlineLogo className="h-5 w-7" />
          <span className="text-base font-semibold tracking-[0.18em] text-foreground">
            TRUETOUCH
          </span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Sell-side attribution · Track 02
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <span
              className={cn(
                "inline-block size-2 rounded-full",
                killed
                  ? "bg-red-500"
                  : connected
                    ? "bg-emerald-500 animate-pulse"
                    : usingMock
                      ? "bg-amber-400 animate-pulse"
                      : "bg-muted-foreground",
              )}
            />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {killed ? "KILLED" : connected ? "LIVE" : usingMock ? "MOCK" : "OFFLINE"}
            </span>
          </div>

          <span
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-md px-2 font-mono text-[10px] tracking-widest",
              riskClasses(risk),
            )}
          >
            <Activity className="size-3" />
            RISK {risk.toUpperCase()}
          </span>

          <Button
            variant="destructive"
            size="sm"
            onClick={onKill}
            disabled={killed}
            className="gap-1.5"
          >
            <Power className="size-3.5" />
            Kill
          </Button>
        </div>
      </div>

      {/* Row 2: the big number + metric chips */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-baseline gap-3">
          {hasNumber ? (
            <>
              <span className="bg-gradient-to-r from-cyan-300 via-indigo-300 to-fuchsia-400 bg-clip-text font-mono text-5xl font-bold tabular-nums leading-none text-transparent">
                {ratio!.toFixed(1)}×
              </span>
              <span className="pb-1 text-sm text-muted-foreground">
                more accurate than last-touch
              </span>
            </>
          ) : (
            <span className="flex items-center gap-2 font-mono text-2xl font-semibold text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              awaiting held-out accuracy…
            </span>
          )}
        </div>

        {hasNumber && (
          <div className="flex flex-wrap gap-2">
            <MetricChip
              label="Credit MAE"
              value={`${evalSummary!.credit_mae?.toFixed(3)} vs ${evalSummary!.last_touch_mae?.toFixed(3)}`}
            />
            <MetricChip
              label="Top-touchpoint match"
              value={`${Math.round((evalSummary!.top_match_rate ?? 0) * 100)}% vs 0%`}
            />
            <MetricChip
              label="ECE (honest)"
              value={`${evalSummary!.ece?.toFixed(2)}`}
            />
          </div>
        )}
      </div>

      {/* Row 3: current-state sentence + step indicator */}
      <div className="flex items-center gap-3 border-t border-border/50 pt-2.5">
        {busy && !killed && (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-cyan-400" />
        )}
        <span className="flex-1 truncate text-[13px] text-foreground/90">
          {statusText}
        </span>
        {step > 0 && (
          <span className="shrink-0 rounded-md border border-border/60 bg-background/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Step {step}
          </span>
        )}
      </div>
    </header>
  );
}
