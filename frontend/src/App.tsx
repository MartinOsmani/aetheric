import { useMemo, useState } from "react";
import { useEventStream } from "@/lib/socket";
import { TopBar } from "@/components/cockpit/TopBar";
import { ApprovalQueue, type PendingApproval } from "@/components/cockpit/ApprovalQueue";
import { AuditLog } from "@/components/cockpit/AuditLog";
import { CenterTabs } from "@/components/cockpit/CenterTabs";
import type {
  Event,
  Risk,
  ApprovalRequired,
  ApprovalResolved,
  ToolCallProposed,
  KillTriggered,
} from "@/types/protocol";

const SESSION_ID = "demo-session";

/**
 * Walk the event stream to derive live cockpit state.
 *
 * - pending approvals: those required, minus those resolved.
 * - current risk: highest risk seen in proposed tool calls that haven't been
 *   resolved or executed yet. Defaults to "low" if nothing is pending.
 * - killed: true once oversight.kill_triggered fires.
 */
function deriveState(events: Event[]) {
  const pendingMap = new Map<string, PendingApproval>();
  const proposedRisks = new Map<string, Risk>();
  let killed = false;
  let killReason = "";

  for (const e of events) {
    switch (e.type) {
      case "agent.tool_call_proposed": {
        const d = e.data as unknown as ToolCallProposed;
        proposedRisks.set(d.tool_use_id, d.risk);
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
      case "oversight.kill_triggered": {
        const d = e.data as unknown as KillTriggered;
        killed = true;
        killReason = d.reason ?? "";
        break;
      }
    }
  }

  // current risk = highest unresolved risk
  let risk: Risk = "low";
  let foundHigh = false;
  let foundMedium = false;
  for (const r of proposedRisks.values()) {
    if (r === "high") {
      foundHigh = true;
      break;
    }
    if (r === "medium") foundMedium = true;
  }
  if (foundHigh) risk = "high";
  else if (foundMedium) risk = "medium";
  // any pending approval implies at least "high" visually
  if (pendingMap.size > 0) risk = "high";

  return {
    pending: Array.from(pendingMap.values()),
    risk,
    killed,
    killReason,
  };
}

function App() {
  const { events, connected, usingMock, sendApproval, sendKill } =
    useEventStream(SESSION_ID);
  const [playbook] = useState<"media_buying" | "attribution">("media_buying");

  const { pending, risk, killed } = useMemo(() => deriveState(events), [events]);

  const handleDecision = (toolUseId: string, decision: "approve" | "deny") => {
    sendApproval(toolUseId, decision);
  };

  const handleKill = () => {
    sendKill("Operator pressed kill switch");
  };

  return (
    <div className="dark flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar
        risk={risk}
        connected={connected}
        usingMock={usingMock}
        killed={killed}
        onKill={handleKill}
      />

      <main className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_360px]">
        <ApprovalQueue pending={pending} onDecision={handleDecision} />
        <CenterTabs events={events} playbook={playbook} />
        <AuditLog events={events} />
      </main>
    </div>
  );
}

export default App;
