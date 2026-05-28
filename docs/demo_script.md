# Aetheric — Live Demo Script (Top-5 Round)

**Track 02: Sell-Side & Measurement** — Cursor × Thrad London 2026.

Total time: **2 minutes**. Practice with a stopwatch; the approval-moment beat
(see 1:15–1:45) is the punchline and needs the deliberate pause.

---

## Setup

1. Backend running: `make backend` (terminal 1)
2. Frontend running: `make frontend` (terminal 2)
3. Cockpit open at `http://localhost:5173` — switch to **Playbook** tab pre-emptively
4. Eval already run: `make eval` — so `get_eval_summary` returns a fresh number
5. Audit log cleared: `rm backend/data/audit/session-*.jsonl` for a clean run

Prompt to type into the cockpit (or hit "Run demo"):

> "Show me what you can do — run the full demo flow."

---

## Beat 1 — Hook (0:00 – 0:15)

> "AI-native advertising is shipping faster than the infrastructure to **trust**
> it. We built **Aetheric** — a Track 02 sell-side agent that stitches
> attribution from chat to conversion, scores per-touchpoint credit with
> **calibrated** confidence, and gates every spend mutation through a visible
> approval queue."

While saying this, hit Run. The cockpit lights up with `session.started` and
the agent's first thinking deltas appear in the right rail.

---

## Beat 2 — The killer number (0:15 – 0:45)

Agent calls `get_eval_summary`. Read the number aloud from the cockpit:

> "Held-out accuracy on 100 journeys: credit MAE **0.055 vs 0.315** for
> last-touch. That's **5.7× better** at the per-touchpoint level, and we
> get the top-credited touchpoint right **63%** of the time — last-touch
> gets it right **0%** of the time. Why? Because last-touch always picks
> the final click, which in AI-surface journeys is almost never the
> channel that actually moved intent."

(Read the **actual** numbers from the cockpit. If the eval has been re-run,
the agent will surface the fresh ones via `get_eval_summary`.)

---

## Beat 3 — Walk one journey (0:45 – 1:15)

Agent calls `list_journeys` → `load_journey` → `attribute_journey`. The
JourneyView panel renders the touchpoint timeline live.

Narrate over the live updates:

> "Here's one journey — UK B2B SaaS buyer, 7 touchpoints, converted at £212.
> Watch the model assign credit. **ai_chat_sponsored_answer** picks up 55% of
> the credit at two distinct exposures; **prompt_aware_native** shows clear
> saturation, dropping from 0.10 to 0.05 on the second exposure. The
> organic_search tail has the lowest confidence — we flag it and we do **not**
> bet money on its exact share."

Point at the top-credit highlighted card and the confidence column on the
right.

---

## Beat 4 — The approval moment (1:15 – 1:45) — *the punchline*

Agent calls `propose_budget_shift`. The cockpit immediately:
- Risk badge flashes to **HIGH**
- A pulsing red card appears in the **Approval Queue** (left rail)
- A `oversight.approval_required` row appears in the **Audit Log** (right rail)
- The agent thinking trace pauses with "awaiting operator approval…"

**Deliberate pause. Let the room see the cockpit waiting.**

> "Every action that moves real money pauses here. The operator sees the
> agent's reasoning, the credit gap that justifies it, and the exact amount
> proposed. **Nothing fires until I tap.**"

Tap **Approve**. The card resolves green, the action executes, the
`budget_shifted` playbook event hits the audit log.

> "Action logged, complete reasoning trace preserved. If this had been the
> wrong call, every byte is auditable after the fact."

---

## Beat 5 — Close (1:45 – 2:00)

> "Verifiable attribution for AI-native publishers. Thrad makes the channel;
> we make the channel **measurable** — and **investable**. Solo build, four
> hours, every action audit-logged."

Hold the cockpit on screen for two beats. Done.

---

## Backup plays

If anything goes wrong on stage:

- **Live LLM latency** — wait it out; the cockpit's audit log + thinking
  stream make even slow turns watchable. Worst case, narrate: "the model is
  reasoning through the journey now."
- **Tavily fails** — irrelevant to Track 02 flow; we don't call it during this demo.
- **Backend crashes** — fall back to the frontend's built-in mock event
  generator, which exercises the same UX without any backend. Open Chrome
  console and watch the mock fire.
- **WebSocket drops** — refresh the page; the `/audit/{session_id}` REST
  endpoint replays history on reconnect.

---

## Anti-narratives (what NOT to say)

- Don't say "I built this in 4 hours" until the close. Sets the wrong frame.
- Don't apologise for the synthetic dataset — pre-empt: "ground truth is the
  point. Real industry attribution has no ground truth, which is why nobody
  has a defensible accuracy number. We do because we generated the data."
- Don't over-explain the architecture mid-demo. The cockpit IS the architecture.
- Don't oversell `propose_budget_shift` as autonomous — the whole point is
  that it's NOT. Sell the gate.

---

## Judges to acknowledge by lens (1:1 after stage)

- **Giorgio (Thrad GTM)** — "This is the measurement layer your Diageo CCO
  hire is trying to build. Want to talk integration?"
- **Rohit (Overmind, ex-PyTorch Lightning)** — "Calibration's at ECE 0.30
  — model is somewhat overconfident on tail touchpoints. Open question I'd
  love your read on."
- **Will Lewis (Duku AI)** — "Every agent action emits a structured audit
  record. Verification is the API surface. Should we be using Duku for
  agentic testing of the approval pipeline?"
- **David Gelberg (10 Downing St)** — "Trust + regulated lens — would
  love your take on the approval-queue UX for adoption in sensitive sectors."
- **John (Strand) / Umberto (Earlybird)** — fundable framing:
  "Aetheric is the **measurement and trust layer** for AI-native
  advertising. Thrad and friends are unlocking the channel; we're what
  makes it investable."
