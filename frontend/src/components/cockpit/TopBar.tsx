import { Shield, Power, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Risk } from "@/types/protocol";

interface TopBarProps {
  risk: Risk;
  connected: boolean;
  usingMock: boolean;
  killed: boolean;
  onKill: () => void;
}

function riskLabel(risk: Risk): string {
  return risk === "low" ? "LOW" : risk === "medium" ? "MEDIUM" : "HIGH";
}

function riskClasses(risk: Risk): string {
  if (risk === "low")
    return "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30";
  if (risk === "medium")
    return "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30";
  return "bg-red-500/15 text-red-400 ring-1 ring-red-500/30";
}

export function TopBar({
  risk,
  connected,
  usingMock,
  killed,
  onKill,
}: TopBarProps) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-card/30 px-4 py-2">
      <div className="flex items-center gap-3">
        <Shield className="size-5 text-indigo-400" />
        <span className="text-base font-semibold tracking-[0.18em] text-foreground">
          AETHERIC
        </span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Cockpit
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
            {killed
              ? "KILLED"
              : connected
                ? "LIVE"
                : usingMock
                  ? "MOCK"
                  : "OFFLINE"}
          </span>
        </div>

        <Badge
          className={cn(
            "h-6 gap-1.5 px-2 font-mono text-[10px] tracking-widest",
            riskClasses(risk),
          )}
        >
          <Activity className="size-3" />
          RISK {riskLabel(risk)}
        </Badge>

        <Button
          variant="destructive"
          size="sm"
          onClick={onKill}
          disabled={killed}
          className="gap-1.5"
        >
          <Power className="size-3.5" />
          Kill Switch
        </Button>
      </div>
    </header>
  );
}
