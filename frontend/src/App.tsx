import { useMemo, useState } from "react";
import { useEventStream } from "@/lib/socket";
import { HeroBar, type EvalSummary } from "@/components/cockpit/HeroBar";
import { RevealPanel } from "@/components/cockpit/RevealPanel";
import { JourneysTable } from "@/components/cockpit/JourneysTable";
import { JourneyDrawer } from "@/components/cockpit/JourneyDrawer";
import {
  ApprovalModal,
  type PendingApproval,
} from "@/components/cockpit/ApprovalModal";
import { AuditModal, AuditChip } from "@/components/cockpit/AuditModal";
import { channelLabel } from "@/lib/channels";
import type {
  JourneyRow,
  JourneyDetail,
  AttribStatus,
  TouchpointCredit,
} from "@/lib/console-types";
import type {
  Event,
  Risk,
  ApprovalRequired,
  ApprovalResolved,
  ToolCallProposed,
} from "@/types/protocol";

// Session id comes from ?session=… so each recording can start on a fresh,
// empty session (no replayed history). Falls back to the shared demo session.
const SESSION_ID =
  new URLSearchParams(window.location.search).get("session") || "demo-session";

interface DerivedState {
  pending: PendingApproval | null;
  risk: Risk;
  killed: boolean;
  evalSummary: EvalSummary | null;
  statusText: string;
  step: number;
  busy: boolean;
  rows: JourneyRow[];
  details: Map<string, JourneyDetail>;
  status: Map<string, AttribStatus>;
  portfolioRevenue: number;
}

function buildDetails(
  events: Event[],
): Map<string, JourneyDetail> {
  // Seed from journeys_listed (every listed customer's steps), then overlay
  // journey_loaded (content hints) and credit_assigned (per-touchpoint credit).
  const listed = new Map<string, JourneyRow>();
  const loaded = new Map<string, Record<string, unknown>>();
  const credit = new Map<string, Record<string, unknown>>();

  for (const e of events) {
    if (e.type !== "playbook.event") continue;
    const d = e.data as { name?: string; payload?: Record<string, unknown> };
    if (!d.payload) continue;
    if (d.name === "journeys_listed") {
      for (const row of (d.payload.journeys as JourneyRow[]) ?? []) {
        listed.set(row.journey_id, row);
      }
      continue;
    }
    const jid = (d.payload as { journey_id?: string }).journey_id;
    if (!jid) continue;
    if (d.name === "journey_loaded") loaded.set(jid, d.payload);
    else if (d.name === "credit_assigned") credit.set(jid, d.payload);
  }

  const out = new Map<string, JourneyDetail>();
  const ids = new Set([...listed.keys(), ...loaded.keys(), ...credit.keys()]);
  for (const jid of ids) {
    const row = listed.get(jid);
    const l = loaded.get(jid);
    const c = credit.get(jid);
    const base = (l ?? c ?? {}) as Record<string, unknown>;

    // Base touchpoints (with content hints) come from journey_loaded or the
    // listed row; credit_assigned overlays per-touchpoint credit by index.
    const loadedTps = (l?.touchpoints as TouchpointCredit[] | undefined) ?? [];
    const listedTps = row?.touchpoints ?? [];
    const creditTps = (c?.touchpoints as TouchpointCredit[] | undefined) ?? [];
    const baseTps = loadedTps.length > 0 ? loadedTps : listedTps;
    const creditByIndex = new Map<number, TouchpointCredit>();
    for (const t of creditTps) creditByIndex.set(t.index, t);

    let touchpoints: TouchpointCredit[];
    if (baseTps.length > 0) {
      touchpoints = baseTps.map((t) => {
        const ct = creditByIndex.get(t.index);
        return ct ? { ...t, ...ct } : t;
      });
    } else {
      touchpoints = creditTps;
    }

    out.set(jid, {
      journey_id: jid,
      user_segment:
        (base.user_segment as string | undefined) ?? row?.user_segment,
      converted: Boolean(base.converted ?? row?.converted),
      revenue_if_converted:
        (l?.revenue_if_converted as number | undefined) ?? row?.revenue,
      touchpoints,
      top_credit_channel: (c?.top_credit_channel as string | null) ?? null,
      is_uncertain: Boolean(c?.is_uncertain),
      attributed: Boolean(c),
    });
  }
  return out;
}

function deriveState(events: Event[]): DerivedState {
  const pendingMap = new Map<string, PendingApproval>();
  const proposedRisks = new Map<string, Risk>();
  const status = new Map<string, AttribStatus>();
  let killed = false;
  let evalSummary: EvalSummary | null = null;
  let rows: JourneyRow[] = [];
  let step = 0;
  let started = false;
  let completed = false;
  let lastJourneyId: string | null = null;
  let lastEvent: Event | null = null;

  for (const e of events) {
    lastEvent = e;
    switch (e.type) {
      case "session.started":
        started = true;
        break;
      case "agent.tool_call_proposed": {
        const d = e.data as unknown as ToolCallProposed;
        proposedRisks.set(d.tool_use_id, d.risk);
        step += 1;
        if (d.tool_name === "attribute_journey") {
          const jid = (d.tool_input as { journey_id?: string })?.journey_id;
          if (jid && status.get(jid) !== "attributed") {
            status.set(jid, "attributing");
          }
        }
        break;
      }
      case "oversight.approval_required": {
        const d = e.data as unknown as ApprovalRequired;
        pendingMap.set(d.tool_use_id, {
          toolUseId: d.tool_use_id,
          toolName: d.tool_name,
          toolInput: d.tool_input,
          riskReason: d.risk_reason,
        });
        break;
      }
      case "oversight.approval_resolved": {
        const d = e.data as unknown as ApprovalResolved;
        pendingMap.delete(d.tool_use_id);
        proposedRisks.delete(d.tool_use_id);
        break;
      }
      case "agent.tool_call_executed": {
        const d = e.data as { tool_use_id: string };
        proposedRisks.delete(d.tool_use_id);
        break;
      }
      case "agent.complete":
        completed = true;
        break;
      case "oversight.kill_triggered":
        killed = true;
        break;
      case "playbook.event": {
        const d = e.data as { name?: string; payload?: Record<string, unknown> };
        if (d.name === "eval_summary" && d.payload) {
          evalSummary = d.payload as EvalSummary;
        } else if (d.name === "journeys_listed" && d.payload) {
          rows = (d.payload.journeys as JourneyRow[]) ?? [];
        } else if (
          (d.name === "journey_loaded" || d.name === "credit_assigned") &&
          d.payload
        ) {
          const jid = (d.payload as { journey_id?: string }).journey_id;
          if (jid) lastJourneyId = jid;
          if (d.name === "credit_assigned" && jid) status.set(jid, "attributed");
        }
        break;
      }
    }
  }

  let risk: Risk = "low";
  for (const r of proposedRisks.values()) {
    if (r === "high") {
      risk = "high";
      break;
    }
    if (r === "medium") risk = "medium";
  }
  if (pendingMap.size > 0) risk = "high";

  const pending = pendingMap.size > 0 ? Array.from(pendingMap.values())[0] : null;
  const executedCount = events.filter(
    (e) => e.type === "agent.tool_call_executed",
  ).length;

  const portfolioRevenue = rows.reduce(
    (acc, r) => acc + (r.converted ? r.revenue : 0),
    0,
  );

  const statusText = deriveStatus({
    killed,
    completed,
    started,
    pending,
    lastEvent,
    lastJourneyId,
    executedCount,
  });

  return {
    pending,
    risk,
    killed,
    evalSummary,
    statusText,
    step,
    busy: started && !completed && !killed && pendingMap.size === 0,
    rows,
    details: buildDetails(events),
    status,
    portfolioRevenue,
  };
}

function deriveStatus(args: {
  killed: boolean;
  completed: boolean;
  started: boolean;
  pending: PendingApproval | null;
  lastEvent: Event | null;
  lastJourneyId: string | null;
  executedCount: number;
}): string {
  const { killed, completed, started, pending, lastEvent, lastJourneyId, executedCount } =
    args;

  if (killed) return "Session terminated by operator — all actions halted.";
  if (pending) {
    if (pending.toolName === "propose_budget_shift") {
      const amt = pending.toolInput.amount;
      return `Awaiting approval to shift £${amt ?? "—"}/day.`;
    }
    return `Awaiting approval for ${pending.toolName}.`;
  }
  if (completed) return `Done — ${executedCount} audited actions.`;
  if (!started || !lastEvent) return "Idle — ask the agent to review the conversion book.";

  const d = lastEvent.data as Record<string, unknown>;
  switch (lastEvent.type) {
    case "session.started":
      return "Session started — planning the attribution run.";
    case "agent.thinking":
      return String(d.text ?? "Thinking…");
    case "agent.message":
      return String(d.text ?? "");
    case "agent.tool_call_proposed":
    case "agent.tool_call_executed": {
      const name = String(d.tool_name ?? "");
      const jid = lastJourneyId ? ` ${lastJourneyId}` : "";
      if (name === "get_eval_summary") return "Reading held-out attribution accuracy…";
      if (name === "list_journeys") return "Loading the conversion book…";
      if (name === "load_journey") return `Loaded journey${jid}.`;
      if (name === "attribute_journey") return `Attributing journey${jid}…`;
      if (name === "propose_budget_shift") return "Proposing a spend reallocation…";
      return `Running ${name}…`;
    }
    case "playbook.event": {
      const name = String(d.name ?? "");
      const jid = lastJourneyId ? ` ${lastJourneyId}` : "";
      if (name === "eval_summary") return "Held-out accuracy loaded.";
      if (name === "journeys_listed") return "Conversion book loaded.";
      if (name === "journey_loaded") return `Loaded journey${jid}.`;
      if (name === "credit_assigned") return `Attributed journey${jid}.`;
      if (name === "budget_shifted") {
        const from = channelLabel(String(d.from_channel));
        const to = channelLabel(String(d.to_channel));
        return `Shifted spend ${from} → ${to}.`;
      }
      return "Working…";
    }
    default:
      return "Working…";
  }
}

function App() {
  const { events, connected, usingMock, sendApproval, sendKill } =
    useEventStream(SESSION_ID);
  const [auditOpen, setAuditOpen] = useState(false);
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);

  const {
    pending,
    risk,
    killed,
    evalSummary,
    statusText,
    step,
    busy,
    rows,
    details,
    status,
    portfolioRevenue,
  } = useMemo(() => deriveState(events), [events]);

  const selectedDetail = selectedJourneyId
    ? details.get(selectedJourneyId) ?? null
    : null;
  const selectedRow = selectedJourneyId
    ? rows.find((r) => r.journey_id === selectedJourneyId)
    : undefined;

  return (
    <div className="dark flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <HeroBar
        evalSummary={evalSummary}
        statusText={statusText}
        step={step}
        risk={risk}
        connected={connected}
        usingMock={usingMock}
        killed={killed}
        busy={busy}
        onKill={() => sendKill("Operator pressed kill switch")}
      />

      <main className="grid min-h-0 flex-1 grid-cols-[380px_minmax(0,1fr)] gap-3 overflow-hidden p-3">
        <div className="min-h-0 overflow-y-auto">
          <RevealPanel evalSummary={evalSummary} portfolioRevenue={portfolioRevenue} />
        </div>
        <JourneysTable
          rows={rows}
          details={details}
          status={status}
          selectedId={selectedJourneyId}
          onSelect={setSelectedJourneyId}
        />
      </main>

      <AuditChip count={events.length} onClick={() => setAuditOpen(true)} />

      <JourneyDrawer
        journey={selectedDetail}
        fallbackLastChannel={selectedRow?.last_channel}
        open={selectedJourneyId !== null}
        onClose={() => setSelectedJourneyId(null)}
      />
      <AuditModal events={events} open={auditOpen} onClose={() => setAuditOpen(false)} />
      <ApprovalModal pending={pending} onDecision={sendApproval} />
    </div>
  );
}

export default App;
