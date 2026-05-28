export type Risk = "low" | "medium" | "high";
export type Decision = "approve" | "deny";
export type Playbook = "attribution" | "media_buying";

export type EventType =
  | "agent.thinking"
  | "agent.message"
  | "agent.tool_call_proposed"
  | "agent.tool_call_executed"
  | "agent.complete"
  | "oversight.approval_required"
  | "oversight.approval_resolved"
  | "oversight.kill_triggered"
  | "playbook.event"
  | "session.started"
  | "session.error";

export interface Event {
  id: string;
  ts: string; // ISO 8601
  session_id: string;
  type: EventType;
  data: Record<string, unknown>;
}

// Per-type payload shapes — `data` for each:
export interface AgentThinkingData {
  text: string;
}
export interface AgentMessageData {
  text: string;
}
export interface ToolCallProposed {
  tool_use_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  risk: Risk;
  risk_reason: string;
}
export interface ToolCallExecuted {
  tool_use_id: string;
  tool_name: string;
  output_preview: string;
  is_error: boolean;
  duration_ms: number;
}
export interface ApprovalRequired {
  tool_use_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  risk_reason: string;
}
export interface ApprovalResolved {
  tool_use_id: string;
  decision: Decision;
  by: "human" | "auto" | "timeout";
  note?: string;
}
export interface KillTriggered {
  reason: string;
}
export interface PlaybookEventData {
  playbook: Playbook;
  name: string;
  payload: Record<string, unknown>;
}

export interface SessionStartedData {
  playbook?: Playbook;
  goal?: string;
}

export interface SessionErrorData {
  message: string;
}
