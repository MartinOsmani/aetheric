# TrueTouch — Demo Script (recorded video)

**Track 02: Sell-Side & Measurement** — Cursor × Thrad London 2026.

Format: **recorded 2–3 minute screen capture** → upload to YouTube → paste the
link in the submission. Retakes are free, so drive it **live** (real agent, real
LLM attribution). Pace it to land the **"last-touch is fooling you"** beat — that
is the centrepiece.

---

## Setup (before you hit record)

1. Backend running: `make backend` (terminal 1).
2. Frontend running: `make frontend` (terminal 2).
3. Eval already cached (it is): `get_eval_summary` returns 6.0× / 75% / MAE 0.054.
4. Run the launcher: `bash scripts/demo.sh` (terminal 3). It will:
   - print a **fresh-session URL** like `http://localhost:5173/?session=demo-HHMMSS`
     — open it; the cockpit starts **empty** (no replayed history),
   - wait for you to start recording, then launch the live agent on ENTER.
5. Optional: full-screen the browser, hide the cursor when not clicking.

> The fresh session is what keeps the cockpit clean. Do **not** record on the
> shared `demo-session` — it replays every past run and looks cluttered.

---

## Beat 0 — Open on the empty cockpit (0:00 – 0:10)

Start recording with the empty cockpit on screen (HeroBar says "awaiting
held-out accuracy…", the book and reveal are empty). Then press ENTER in the
launcher to start the agent.

> "AI-native advertising is shipping faster than the infrastructure to **trust**
> it. This is TrueTouch — a sell-side attribution agent for AI publishers."

---

## Beat 1 — The killer number (0:10 – 0:35)

The agent calls `get_eval_summary`; the **HeroBar** flips to the big number.

> "First, can we even trust the attribution? On 50 held-out journeys with
> **known ground truth**, our credit error is **0.054 versus 0.324** for
> last-touch — **6× more accurate** — and we pick the true top touchpoint
> **75%** of the time versus **0%** for last-touch. ECE 0.31: we're honest that
> we're a little overconfident on the tail."

Point at the three metric chips. (Ground truth is the whole trick — say so in
Beat 4 if asked, or in the close.)

---

## Beat 2 — "Last-touch is fooling you" (0:35 – 1:05) — *the centrepiece*

The **Reveal panel** (left) fills in as `eval_summary` lands; the **Conversions
attribution book** (right) populates from `list_journeys`.

> "Here's why that gap matters. This is what last-touch credits, in red, versus
> what actually earned the conversions, in blue. Last-touch **over-credits
> display retargeting by 14 points** and **organic search by 10** — the last
> clicks — while **under-crediting the AI chat sponsored answers** that actually
> moved intent. Across this book that's about **£170 of credit pointed at the
> wrong channels.** That's real budget following the wrong signal."

Glance at the book: "And here's the whole conversion book — every customer,
what last-touch claims, and what TrueTouch says."

---

## Beat 3 — Drill into one customer (1:05 – 1:35)

Wait until the agent has **attributed** a journey (its "TrueTouch says" cell
fills in), then **click that row**. The drawer slides in.

> "Take one customer. Last-touch hands **100%** to the final click. But look at
> the real journey — the AI chat sponsored answer here is the top-credit
> touchpoint at high confidence, while the channel last-touch rewarded earned a
> fraction of that. Every touchpoint shows credit **and** how sure we are —
> '78% sure' — and we flag the low-confidence ones instead of pretending."

Point at the fuchsia **top-credit** highlight and a "low conf" flag. Close the
drawer.

---

## Beat 4 — The approval moment (1:35 – 2:05) — *the trust punchline*

The agent calls `propose_budget_shift`. The **approval modal blocks the screen**;
the HeroBar RISK badge flips to **HIGH**.

**Deliberate pause. Let the modal sit.**

> "So the agent proposes moving budget from the over-credited channel to where
> attribution says conversions actually happen. But this moves **real money** —
> so it stops. The operator sees the from-channel, the to-channel, the amount,
> and the agent's reasoning. **Nothing moves until I approve.**"

Click **Approve**. The modal dismisses; the action executes.

> "Approved, executed, and logged."

Click the footer **Audit** chip.

> "Every step — every tool call, the risk score, the approval — is in an
> append-only audit trail. The verification is the product."

---

## Beat 5 — Close (2:05 – 2:25)

> "Verifiable, calibrated attribution for AI-native publishers — and every pound
> gated by a human. Thrad makes the channel; TrueTouch makes it **measurable and
> investable.** Solo build."

Hold on the cockpit for a beat. Stop recording.

---

## Recording tips

- **Pacing:** the live attribution takes ~10–15s. Narrate Beat 2 (the reveal)
  over it — by the time you finish, a journey is attributed and ready to click.
- **If a take drifts** (agent attributes a different journey, picks a different
  £ amount): fine — the script is channel-agnostic. Just click whichever row
  shows an "TrueTouch says" verdict.
- **Clean restart:** re-run `bash scripts/demo.sh` for a brand-new empty session.
- **Backend blip mid-take:** the cockpit auto-falls back to the scripted mock
  (same flow). Either keep rolling or restart the backend and re-run the launcher.
- **Don't** record on `demo-session` — stale history will clutter the view.

---

## Anti-narratives (what NOT to say)

- Don't apologise for the synthetic dataset — pre-empt it: "ground truth is the
  point. Real attribution has no ground truth, which is why nobody has a
  defensible accuracy number. We do, because we generated the data."
- Don't oversell `propose_budget_shift` as autonomous — the whole point is that
  it is **not**. Sell the gate.
- Don't over-explain architecture. The console IS the architecture.

---

## Judges to acknowledge by lens (1:1 after the event)

- **Giorgio (Thrad GTM)** — "This is the measurement layer your Diageo CCO hire
  is trying to build. Want to talk integration?"
- **Rohit (Overmind, ex-PyTorch Lightning)** — "Calibration's at ECE 0.31 —
  honestly overconfident on tail touchpoints. I'd love your read."
- **Will Lewis (Duku AI)** — "Every agent action emits a structured audit
  record. Verification is the API surface."
- **David Gelberg (10 Downing St)** — "Trust + regulated lens — your take on the
  approval-gate UX for sensitive sectors?"
- **John (Strand) / Umberto (Earlybird)** — "TrueTouch is the measurement and
  trust layer for AI-native advertising. Thrad unlocks the channel; we make it
  investable."
