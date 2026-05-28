import type { Decision, Playbook } from "@/types/protocol";

const BASE_URL = "http://localhost:8000";

export interface AgentRunRequest {
  session_id: string;
  playbook: Playbook;
  goal: string;
}

export interface ApprovalRequest {
  session_id: string;
  tool_use_id: string;
  decision: Decision;
  note?: string;
}

export interface KillRequest {
  session_id: string;
  reason: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function startAgentRun(req: AgentRunRequest) {
  return post<{ ok: boolean; session_id: string }>("/agent/run", req);
}

export function postApproval(req: ApprovalRequest) {
  return post<{ ok: boolean }>("/approve", req);
}

export function postKill(req: KillRequest) {
  return post<{ ok: boolean }>("/kill", req);
}
