import type { Event, EventType } from "@/types/protocol";

let counter = 0;
function nextId(): string {
  counter += 1;
  return `mock-${Date.now().toString(36)}-${counter}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeEvent<T extends EventType>(
  sessionId: string,
  type: T,
  data: Record<string, unknown>,
): Event {
  return {
    id: nextId(),
    ts: nowIso(),
    session_id: sessionId,
    type,
    data,
  };
}

export interface MockController {
  stop: () => void;
  approve: (toolUseId: string) => void;
  deny: (toolUseId: string) => void;
  kill: (reason: string) => void;
  reset: () => void;
}

interface PendingApproval {
  toolUseId: string;
  resolve: (decision: "approve" | "deny") => void;
}

/**
 * Mock event generator. Emits a realistic agent run on a timer with
 * a high-risk gate that waits for the user to call approve()/deny().
 */
export function startMockStream(
  sessionId: string,
  emit: (e: Event) => void,
): MockController {
  let stopped = false;
  let pendingApproval: PendingApproval | null = null;
  const timers: ReturnType<typeof setTimeout>[] = [];

  function schedule(fn: () => void, delay: number) {
    const t = setTimeout(() => {
      if (!stopped) fn();
    }, delay);
    timers.push(t);
  }

  function stop() {
    stopped = true;
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
  }

  function run() {
    // 1. session.started
    schedule(() => {
      emit(
        makeEvent(sessionId, "session.started", {
          playbook: "media_buying",
          goal: "Maximise ROAS on Acme Q4 launch campaign",
        }),
      );
    }, 100);

    // Playbook ticks — drive the chart in the centre tab.
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    days.forEach((day, idx) => {
      schedule(() => {
        emit(
          makeEvent(sessionId, "playbook.event", {
            playbook: "media_buying",
            name: "metrics_tick",
            payload: {
              day,
              channel: "google_search",
              spend: 320 + idx * 28 + Math.round(Math.random() * 30),
              conversions: 18 + idx * 3 + Math.round(Math.random() * 4),
            },
          }),
        );
      }, 300 + idx * 120);
    });

    // 2. thinking
    schedule(() => {
      emit(
        makeEvent(sessionId, "agent.thinking", {
          text: "Examining campaign metrics for the last 7 days…",
        }),
      );
    }, 1500);

    schedule(() => {
      emit(
        makeEvent(sessionId, "agent.thinking", {
          text: "Looking for underperforming ad groups vs ROAS target of 3.5x.",
        }),
      );
    }, 2400);

    // 3. low-risk proposal → executed
    schedule(() => {
      emit(
        makeEvent(sessionId, "agent.tool_call_proposed", {
          tool_use_id: "tu_get_metrics_1",
          tool_name: "get_metrics",
          tool_input: { campaign_id: "cmp_42", days: 7 },
          risk: "low",
          risk_reason: "Read-only query, no spend impact.",
        }),
      );
    }, 3300);

    schedule(() => {
      emit(
        makeEvent(sessionId, "agent.tool_call_executed", {
          tool_use_id: "tu_get_metrics_1",
          tool_name: "get_metrics",
          output_preview:
            'rows=14; channels=["google_search","meta"]; roas_avg=2.81',
          is_error: false,
          duration_ms: 412,
        }),
      );
    }, 4200);

    // 4. another thought
    schedule(() => {
      emit(
        makeEvent(sessionId, "agent.thinking", {
          text:
            "Meta is dragging the average. I'll shift £200/day from Meta → Google Search to lift ROAS.",
        }),
      );
    }, 5100);

    // 5. high-risk proposal → approval required (BLOCKS)
    schedule(() => {
      const toolUseId = "tu_adjust_budget_1";
      emit(
        makeEvent(sessionId, "agent.tool_call_proposed", {
          tool_use_id: toolUseId,
          tool_name: "adjust_budget",
          tool_input: {
            campaign_id: "cmp_42",
            channel_from: "meta",
            channel_to: "google_search",
            delta_gbp: 200,
          },
          risk: "high",
          risk_reason:
            "Reallocates £200/day in live spend. Requires human approval.",
        }),
      );
      emit(
        makeEvent(sessionId, "oversight.approval_required", {
          tool_use_id: toolUseId,
          tool_name: "adjust_budget",
          tool_input: {
            campaign_id: "cmp_42",
            channel_from: "meta",
            channel_to: "google_search",
            delta_gbp: 200,
          },
          risk_reason:
            "Reallocates £200/day in live spend. Requires human approval.",
        }),
      );

      // wait for human decision via approve()/deny()
      pendingApproval = {
        toolUseId,
        resolve: (decision) => {
          if (stopped) return;
          emit(
            makeEvent(sessionId, "oversight.approval_resolved", {
              tool_use_id: toolUseId,
              decision,
              by: "human",
            }),
          );

          if (decision === "approve") {
            schedule(() => {
              emit(
                makeEvent(sessionId, "agent.tool_call_executed", {
                  tool_use_id: toolUseId,
                  tool_name: "adjust_budget",
                  output_preview:
                    "ok=true; new_meta_daily=480; new_google_daily=720",
                  is_error: false,
                  duration_ms: 873,
                }),
              );
            }, 700);

            schedule(() => {
              emit(
                makeEvent(sessionId, "agent.message", {
                  text: "Done — projected ROAS lift 14% over 7 days.",
                }),
              );
            }, 1600);

            schedule(() => {
              emit(
                makeEvent(sessionId, "agent.complete", {
                  status: "ok",
                }),
              );
            }, 2300);
          } else {
            schedule(() => {
              emit(
                makeEvent(sessionId, "agent.message", {
                  text:
                    "Understood — leaving spend allocation untouched. Will surface this again with more evidence.",
                }),
              );
            }, 700);

            schedule(() => {
              emit(
                makeEvent(sessionId, "agent.complete", {
                  status: "denied",
                }),
              );
            }, 1500);
          }
        },
      };
    }, 6000);
  }

  function approve(toolUseId: string) {
    if (pendingApproval && pendingApproval.toolUseId === toolUseId) {
      const p = pendingApproval;
      pendingApproval = null;
      p.resolve("approve");
    }
  }

  function deny(toolUseId: string) {
    if (pendingApproval && pendingApproval.toolUseId === toolUseId) {
      const p = pendingApproval;
      pendingApproval = null;
      p.resolve("deny");
    }
  }

  function kill(reason: string) {
    emit(
      makeEvent(sessionId, "oversight.kill_triggered", {
        reason,
      }),
    );
    stop();
  }

  function reset() {
    stop();
    stopped = false;
    pendingApproval = null;
    run();
  }

  run();

  return { stop, approve, deny, kill, reset };
}
