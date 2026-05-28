import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp } from "lucide-react";
import type { Event, PlaybookEventData } from "@/types/protocol";

interface CampaignChartProps {
  events: Event[];
}

interface ChartPoint {
  day: string;
  spend: number;
  conversions: number;
}

export function CampaignChart({ events }: CampaignChartProps) {
  const data = useMemo<ChartPoint[]>(() => {
    const points: ChartPoint[] = [];
    for (const e of events) {
      if (e.type !== "playbook.event") continue;
      const d = e.data as unknown as PlaybookEventData;
      if (d.playbook !== "media_buying" || d.name !== "metrics_tick") continue;
      const p = d.payload as {
        day?: string;
        spend?: number;
        conversions?: number;
      };
      if (typeof p.day === "string") {
        points.push({
          day: p.day,
          spend: Number(p.spend ?? 0),
          conversions: Number(p.conversions ?? 0),
        });
      }
    }
    return points;
  }, [events]);

  const totalSpend = data.reduce((acc, d) => acc + d.spend, 0);
  const totalConv = data.reduce((acc, d) => acc + d.conversions, 0);
  const roas = totalConv > 0 ? (totalConv * 65) / Math.max(totalSpend, 1) : 0;

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-fuchsia-400" />
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-widest text-foreground">
            Media Buying · cmp_42
          </h3>
        </div>
        <div className="flex gap-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <div>
            spend{" "}
            <span className="font-semibold tabular-nums text-foreground">
              £{totalSpend.toLocaleString()}
            </span>
          </div>
          <div>
            conv{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {totalConv}
            </span>
          </div>
          <div>
            roas{" "}
            <span className="font-semibold tabular-nums text-emerald-400">
              {roas.toFixed(2)}x
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 rounded-md border border-border/60 bg-card/30 p-2">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Waiting for playbook metrics…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 16, right: 24, bottom: 8, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="2 4"
                stroke="rgba(255,255,255,0.06)"
              />
              <XAxis
                dataKey="day"
                stroke="rgba(255,255,255,0.4)"
                tick={{
                  fontSize: 10,
                  fontFamily: "ui-monospace, monospace",
                  fill: "rgba(255,255,255,0.6)",
                }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              />
              <YAxis
                yAxisId="left"
                stroke="rgba(255,255,255,0.4)"
                tick={{
                  fontSize: 10,
                  fontFamily: "ui-monospace, monospace",
                  fill: "rgba(255,255,255,0.6)",
                }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="rgba(255,255,255,0.4)"
                tick={{
                  fontSize: 10,
                  fontFamily: "ui-monospace, monospace",
                  fill: "rgba(255,255,255,0.6)",
                }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(20,20,28,0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 6,
                  fontSize: 11,
                  fontFamily: "ui-monospace, monospace",
                }}
                labelStyle={{ color: "rgba(255,255,255,0.7)" }}
              />
              <Legend
                wrapperStyle={{
                  fontSize: 10,
                  fontFamily: "ui-monospace, monospace",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="spend"
                name="Spend (£)"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0, fill: "#a78bfa" }}
                activeDot={{ r: 5 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="conversions"
                name="Conversions"
                stroke="#34d399"
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0, fill: "#34d399" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
