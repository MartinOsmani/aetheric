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
  return { id: nextId(), ts: nowIso(), session_id: sessionId, type, data };
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

// A converter journey using the verbatim channel taxonomy, mirroring the
// shapes emitted by the real attribution playbook (journey_loaded / credit_assigned).
const JOURNEY_ID = "j-00015";
const TOUCHPOINTS_LOADED = [
  { index: 0, channel: "organic_search", minutes_offset: 0, content_hint: "Searched 'best CRM for small teams'" },
  { index: 1, channel: "ai_chat_sponsored_answer", minutes_offset: 42, content_hint: "AI assistant recommended Acme CRM in answer" },
  { index: 2, channel: "display_retargeting", minutes_offset: 310, content_hint: "Banner impression on a news site" },
  { index: 3, channel: "prompt_aware_native", minutes_offset: 880, content_hint: "Native suggestion inside a writing tool" },
  { index: 4, channel: "ai_chat_sponsored_answer", minutes_offset: 1440, content_hint: "Follow-up AI answer comparing CRMs" },
];
// Build a plausible touchpoint sequence (no credit) for the mock conversion book.
function mockTps(channels: string[]) {
  const hints: Record<string, string> = {
    ai_chat_sponsored_answer: "Sponsored answer recommended the brand",
    prompt_aware_native: "Native suggestion inside a relevant prompt",
    sponsored_autocomplete: "Sponsored autocomplete suggestion",
    podcast_readout: "Podcast pre-roll readout",
    display_retargeting: "Retargeting banner impression",
    organic_search: "Organic search for the category",
  };
  return channels.map((channel, i) => ({
    index: i,
    channel,
    minutes_offset: i * 120,
    content_hint: hints[channel] ?? channel,
  }));
}

const CREDIT = [
  { index: 0, channel: "organic_search", minutes_offset: 0, credit: 0.05, confidence: 0.82, low_confidence: false, reason: "Entry point, but generic intent." },
  { index: 1, channel: "ai_chat_sponsored_answer", minutes_offset: 42, credit: 0.34, confidence: 0.88, low_confidence: false, reason: "First branded exposure that shifted intent materially." },
  { index: 2, channel: "display_retargeting", minutes_offset: 310, credit: 0.06, confidence: 0.41, low_confidence: true, reason: "Weak signal — hard to separate from background noise." },
  { index: 3, channel: "prompt_aware_native", minutes_offset: 880, credit: 0.16, confidence: 0.74, low_confidence: false, reason: "Reinforced consideration in-context." },
  { index: 4, channel: "ai_chat_sponsored_answer", minutes_offset: 1440, credit: 0.39, confidence: 0.9, low_confidence: false, reason: "Closing answer directly preceded conversion." },
];

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

  function pb(name: string, payload: Record<string, unknown>) {
    return makeEvent(sessionId, "playbook.event", {
      playbook: "attribution",
      name,
      payload,
    });
  }

  function run() {
    schedule(() => {
      emit(
        makeEvent(sessionId, "session.started", {
          playbook: "attribution",
          goal: "Show sell-side attribution + gated spend reallocation",
        }),
      );
    }, 100);

    // 1. get_eval_summary → eval_summary playbook event (drives the hero number)
    schedule(() => {
      emit(
        makeEvent(sessionId, "agent.thinking", {
          text: "Starting with our held-out accuracy so the number is defensible.",
        }),
      );
    }, 900);
    schedule(() => {
      emit(
        makeEvent(sessionId, "agent.tool_call_proposed", {
          tool_use_id: "tu_eval",
          tool_name: "get_eval_summary",
          tool_input: {},
          risk: "low",
          risk_reason: "Read-only — reads the cached eval report.",
        }),
      );
    }, 1500);
    schedule(() => {
      emit(
        pb("eval_summary", {
          credit_mae: 0.054,
          last_touch_mae: 0.3242,
          ratio_better: 6.01,
          top_match_rate: 0.75,
          ece: 0.3068,
          n_test: 50,
          n_test_converters: 16,
          per_channel_credit_share: {
            ours: {
              podcast_readout: 0.0606,
              display_retargeting: 0.0463,
              sponsored_autocomplete: 0.1537,
              ai_chat_sponsored_answer: 0.4731,
              prompt_aware_native: 0.2369,
              organic_search: 0.0294,
            },
            last_touch: {
              podcast_readout: 0.0625,
              display_retargeting: 0.1875,
              sponsored_autocomplete: 0.0625,
              ai_chat_sponsored_answer: 0.375,
              prompt_aware_native: 0.1875,
              organic_search: 0.125,
            },
          },
        }),
      );
      emit(
        makeEvent(sessionId, "agent.tool_call_executed", {
          tool_use_id: "tu_eval",
          tool_name: "get_eval_summary",
          output_preview: "ratio_better=6.01; credit_mae=0.054; top_match=0.75",
          is_error: false,
          duration_ms: 38,
        }),
      );
    }, 2400);

    // 1b. list_journeys → journeys_listed (populates the conversion book)
    schedule(() => {
      emit(
        makeEvent(sessionId, "agent.tool_call_proposed", {
          tool_use_id: "tu_list",
          tool_name: "list_journeys",
          tool_input: { converted_only: true, limit: 6 },
          risk: "low",
          risk_reason: "Read-only — lists candidate journeys.",
        }),
      );
      emit(
        pb("journeys_listed", {
          journeys: [
            { journey_id: "j-00015", user_segment: "uk_b2b_saas_buyer", n_touchpoints: 5, converted: true, revenue: 540, last_channel: "ai_chat_sponsored_answer", touchpoints: TOUCHPOINTS_LOADED },
            { journey_id: "j-00021", user_segment: "us_d2c_retail", n_touchpoints: 4, converted: true, revenue: 128, last_channel: "display_retargeting", touchpoints: mockTps(["organic_search", "sponsored_autocomplete", "ai_chat_sponsored_answer", "display_retargeting"]) },
            { journey_id: "j-00042", user_segment: "us_b2b_developer", n_touchpoints: 6, converted: true, revenue: 612, last_channel: "organic_search", touchpoints: mockTps(["ai_chat_sponsored_answer", "prompt_aware_native", "podcast_readout", "display_retargeting", "ai_chat_sponsored_answer", "organic_search"]) },
            { journey_id: "j-00058", user_segment: "uk_consumer_lifestyle", n_touchpoints: 3, converted: true, revenue: 89, last_channel: "display_retargeting", touchpoints: mockTps(["organic_search", "ai_chat_sponsored_answer", "display_retargeting"]) },
            { journey_id: "j-00073", user_segment: "global_enterprise_decision_maker", n_touchpoints: 7, converted: true, revenue: 1450, last_channel: "podcast_readout", touchpoints: mockTps(["organic_search", "ai_chat_sponsored_answer", "prompt_aware_native", "sponsored_autocomplete", "display_retargeting", "ai_chat_sponsored_answer", "podcast_readout"]) },
            { journey_id: "j-00090", user_segment: "uk_b2b_saas_buyer", n_touchpoints: 5, converted: true, revenue: 367, last_channel: "organic_search", touchpoints: mockTps(["ai_chat_sponsored_answer", "prompt_aware_native", "display_retargeting", "ai_chat_sponsored_answer", "organic_search"]) },
          ],
        }),
      );
      emit(
        makeEvent(sessionId, "agent.tool_call_executed", {
          tool_use_id: "tu_list",
          tool_name: "list_journeys",
          output_preview: "count=6 converters",
          is_error: false,
          duration_ms: 6,
        }),
      );
    }, 3000);

    // 2. load_journey
    schedule(() => {
      emit(
        makeEvent(sessionId, "agent.tool_call_proposed", {
          tool_use_id: "tu_load",
          tool_name: "load_journey",
          tool_input: { journey_id: JOURNEY_ID },
          risk: "low",
          risk_reason: "Read-only — loads one journey.",
        }),
      );
    }, 3400);
    schedule(() => {
      emit(
        pb("journey_loaded", {
          journey_id: JOURNEY_ID,
          user_segment: "smb_saas",
          converted: true,
          revenue_if_converted: 540,
          touchpoints: TOUCHPOINTS_LOADED,
        }),
      );
      emit(
        makeEvent(sessionId, "agent.tool_call_executed", {
          tool_use_id: "tu_load",
          tool_name: "load_journey",
          output_preview: `journey_id=${JOURNEY_ID}; touchpoints=5; converted=true`,
          is_error: false,
          duration_ms: 12,
        }),
      );
    }, 4300);

    // 3. attribute_journey → credit_assigned
    schedule(() => {
      emit(
        makeEvent(sessionId, "agent.tool_call_proposed", {
          tool_use_id: "tu_attr",
          tool_name: "attribute_journey",
          tool_input: { journey_id: JOURNEY_ID },
          risk: "low",
          risk_reason: "Read-only — runs the LLM-as-judge attribution.",
        }),
      );
    }, 5300);
    schedule(() => {
      emit(
        pb("credit_assigned", {
          journey_id: JOURNEY_ID,
          converted: true,
          touchpoints: CREDIT,
          top_credit_channel: "ai_chat_sponsored_answer",
          is_uncertain: true,
        }),
      );
      emit(
        makeEvent(sessionId, "agent.tool_call_executed", {
          tool_use_id: "tu_attr",
          tool_name: "attribute_journey",
          output_preview: "top=ai_chat_sponsored_answer; 1 low-confidence touchpoint flagged",
          is_error: false,
          duration_ms: 2100,
        }),
      );
    }, 6800);

    // 4. propose_budget_shift → HIGH risk, blocks for approval
    schedule(() => {
      emit(
        makeEvent(sessionId, "agent.thinking", {
          text:
            "Display retargeting earns 6% credit but soaks budget. I'll move £400/day to AI chat sponsored answers, which earned 73% across both touches.",
        }),
      );
    }, 7800);
    schedule(() => {
      const toolUseId = "tu_shift";
      const toolInput = {
        from_channel: "display_retargeting",
        to_channel: "ai_chat_sponsored_answer",
        amount: 400,
        reason:
          "Display retargeting earned only 6% credit vs 73% for AI chat sponsored answers; reallocate to where attribution says conversion actually happens.",
      };
      emit(
        makeEvent(sessionId, "agent.tool_call_proposed", {
          tool_use_id: toolUseId,
          tool_name: "propose_budget_shift",
          tool_input: toolInput,
          risk: "high",
          risk_reason: "Reallocates £400/day in live spend. Requires human approval.",
        }),
      );
      emit(
        makeEvent(sessionId, "oversight.approval_required", {
          tool_use_id: toolUseId,
          tool_name: "propose_budget_shift",
          tool_input: toolInput,
          risk_reason: "Reallocates £400/day in live spend. Requires human approval.",
        }),
      );

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
                pb("budget_shifted", {
                  from_channel: "display_retargeting",
                  to_channel: "ai_chat_sponsored_answer",
                  amount: 400,
                  reason: "Approved by operator.",
                }),
              );
              emit(
                makeEvent(sessionId, "agent.tool_call_executed", {
                  tool_use_id: toolUseId,
                  tool_name: "propose_budget_shift",
                  output_preview: "ok=true; £400/day display_retargeting → ai_chat_sponsored_answer",
                  is_error: false,
                  duration_ms: 90,
                }),
              );
            }, 600);
            schedule(() => {
              emit(
                makeEvent(sessionId, "agent.message", {
                  text:
                    "Done — £400/day moved to AI chat sponsored answers. Logged to the audit trail.",
                }),
              );
            }, 1400);
            schedule(() => {
              emit(makeEvent(sessionId, "agent.complete", { status: "ok" }));
            }, 2100);
          } else {
            schedule(() => {
              emit(
                makeEvent(sessionId, "agent.message", {
                  text: "Understood — leaving spend untouched. Nothing was moved.",
                }),
              );
            }, 600);
            schedule(() => {
              emit(makeEvent(sessionId, "agent.complete", { status: "denied" }));
            }, 1300);
          }
        },
      };
    }, 8600);
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
    emit(makeEvent(sessionId, "oversight.kill_triggered", { reason }));
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
