# Aetheric Attribution Console — design spec

**Date:** 2026-05-28
**Status:** approved (design), pending implementation
**Author:** Martin + Claude

---

## Context & problem

The rebuilt cockpit reads as a **data display, not a product**. It walks one
journey at a time and shows credit bars + an accuracy number, but a viewer has
to *infer* the "so what." Two gaps:

1. **It's a showcase, not a platform.** One customer on screen at a time. There
   is no portfolio view, no sense that this is an operator's control room over
   *many* conversions.
2. **The killer insight is buried.** The single most compelling, commercial
   fact — *last-touch attribution credits the wrong channel and misspends
   money* — is never shown directly. The 6.0× stat states it abstractly; the UI
   never makes it visceral.

This redesign turns the cockpit into an **Attribution Console**: a portfolio
control room whose centerpiece is the *"last-touch is fooling you"* reveal,
backed by per-customer drill-in.

**Protagonist:** the publisher / ad-ops operator running Aetheric — surveying
many conversions, seeing where naive attribution lies, and gating spend moves.

**Core beat (above all else):** *last-touch is fooling you* — it credits the
last click, not the cause, and that misdirects real money.

---

## Goals / non-goals

**Goals**
- Show **many journeys at once** in a scannable, operator-controlled table.
- Make the **last-touch-vs-truth gap** the visual centerpiece, at portfolio
  scale (instant) and per customer (on drill-in).
- Frame credit in **money (£)**, not just percentages.
- Reuse the existing backend, JourneyView, approval modal, and audit log.

**Non-goals (YAGNI)**
- No live bulk attribution of dozens of journeys (each LLM call ~14s — too slow
  and token-heavy for the demo). Per-journey attribution stays on-demand.
- No new persistence, auth, or per-journey cached attribution artifacts.
- No charting library beyond what we already have; the reveal is simple bars.

---

## Design

### Layout (single page, dark)

```
┌───────────────────────────────────────────────────────────┐
│ HeroBar  (unchanged: 6.0× accuracy, status, risk, kill)    │
├──────────────────────────────┬────────────────────────────┤
│ Reveal panel (THE centerpiece)│  Journeys table            │
│ "What last-touch credits" vs  │  rows = customers          │
│ "What actually earned it"     │  click → drill-in drawer   │
│ + £ misattributed headline    │                            │
├──────────────────────────────┴────────────────────────────┤
│ Footer audit chip                                          │
└───────────────────────────────────────────────────────────┘
   Drawer (slide-in): JourneyView detail for the selected row
   Overlay: ApprovalModal (unchanged), AuditModal (unchanged)
```

On narrow heights the Reveal + table stack; the drawer is an overlay panel.

### Components

- **`HeroBar.tsx`** — unchanged.
- **`RevealPanel.tsx`** (new) — the "last-touch is fooling you" centerpiece.
  Per channel, two bars: **last-touch share** vs **Aetheric share**, sorted by
  the size of the disagreement. Channels last-touch *over-credits* (display
  retargeting, organic search) are marked as "over-credited"; channels it
  *under-credits* (AI chat sponsored answer) as "under-credited." A headline
  line: *"Last-touch misattributes ~£X across these N conversions — it credits
  the last click, not the cause."* Sourced from the cached
  `eval_summary.per_channel_credit_share` (`ours` vs `last_touch`); **no live
  computation**, so it's instant and real.
- **`JourneysTable.tsx`** (new) — many customers. Columns: customer/segment,
  £ revenue, # touchpoints, **Last-touch's verdict** (final-click channel,
  shown for every row instantly), **Aetheric's verdict** (top-credit channel,
  "—" until attributed), status badge (`pending` / `attributing` / `attributed`,
  driven by the event stream). Rows clickable: selecting a row **opens the
  drawer for viewing**. Attribution itself is driven by the agent calling
  `attribute_journey` (the demo path); the table simply reflects whatever has
  been attributed so far. Operator-initiated "Attribute" buttons are an
  optional stretch (would need a small `POST /attribute/{journey_id}` endpoint
  that calls the attribution model and emits `credit_assigned`) — out of scope
  for the first pass.
- **`JourneyDrawer.tsx`** (new, thin wrapper) — slides in, renders the existing
  **`JourneyView`** for the selected journey, plus a **per-customer contrast
  line**: *"Last-touch credits 100% to {final channel} — Aetheric says it
  earned only {our credit for that channel}%."* and £ credit per channel
  (credit × journey revenue).
- **`JourneyView.tsx`** — reused as-is (already shows touchpoints, credit bars,
  confidence as "78% sure", aggregate side panel).
- **`ApprovalModal.tsx`, `AuditModal.tsx`** — unchanged.

### Data flow

The frontend continues to derive all state from the WebSocket event stream
(`deriveState` in `App.tsx`), extended to track:
- `evalSummary` (existing) → also feeds **RevealPanel**.
- `journeys` list ← **new `journeys_listed` playbook event**.
- per-journey detail ← existing `journey_loaded` / `credit_assigned` events,
  keyed by `journey_id` (today only the *latest* journey is tracked; extend to
  a `Map<journey_id, Journey>` so the table + drawer can show any of them).
- selected journey id ← local UI state (row click).

### Backend changes (minimal — mirror the `eval_summary` emit)

1. **`list_journeys` enrichment** (`playbooks/attribution/tools.py`):
   - add `last_channel: j.touchpoints[-1].channel` to each row dict.
   - after building `out`, emit a `journeys_listed` playbook event:
     `{ "journeys": out }` (each item: `journey_id, user_segment,
     n_touchpoints, converted, revenue, last_channel`).
   - Use the existing `_emit()` helper. Keep the return value as-is.
2. Nothing else. `attribute_journey` already emits `credit_assigned`;
   `get_eval_summary` already emits `eval_summary`. The Reveal and the
   per-journey contrast are computed **client-side** from streamed data.

### Client-side computations

- **Reveal gap (portfolio):** for each channel,
  `gap = ours_share − last_touch_share`. Sort by `|gap|`. Over-credited =
  `gap < 0`, under-credited = `gap > 0`. £ headline:
  `Σ_channels max(0, last_touch_share − ours_share) × portfolio_revenue`,
  where `portfolio_revenue = Σ revenue` of converters in the `journeys_listed`
  set. Framed as "across these N conversions worth £T."
- **Last-touch per-journey verdict (table + drawer):** the final touchpoint's
  channel gets 100% under last-touch. In the table this is the `last_channel`
  field. In the drawer, the contrast = `our credit for that final channel`
  (from `credit_assigned`) vs 100%.
- **£ per channel (drawer):** `credit × journey.revenue_if_converted`.

---

## What's reused vs new

| Reused unchanged | New |
|---|---|
| `HeroBar`, `JourneyView`, `ApprovalModal`, `AuditModal`, `socket.ts`, `protocol.ts`, event bus, agent runtime, oversight, audit log | `RevealPanel`, `JourneysTable`, `JourneyDrawer`; `journeys_listed` emit + `last_channel` field; `App.tsx` state extended to a journey map + selection |

`mockEvents.ts` gains a `journeys_listed` emit (a handful of journeys with
`last_channel`) so the table is populated in the WS-fallback demo path too.

---

## Verification

- **Unit:** `make test` — 4/4 oversight invariants still green (no oversight
  code touched).
- **Build:** `vite build` clean.
- **End-to-end (real backend):** run the agent; confirm:
  1. RevealPanel renders the last-touch-vs-Aetheric bars with the £ headline
     once `eval_summary` arrives.
  2. JourneysTable populates from `journeys_listed`, each row showing the
     last-touch verdict (final channel) instantly.
  3. Clicking a row opens the drawer with JourneyView + the contrast line;
     attribution fills in Aetheric's verdict and £-per-channel.
  4. `propose_budget_shift` still blocks via ApprovalModal; audit chip opens
     the full log.
- **Mock fallback:** with the backend down, the table + reveal still populate
  from `mockEvents`.

---

## Demo impact

The on-stage line becomes: *"Here's our whole book of conversions. Last-touch
hands 19% of the credit to display and organic search — channels that actually
earned 8%. That's real money pointed at the wrong place. Aetheric fixes it, per
customer, and asks before moving a pound."* The Reveal makes the 6.0× concrete;
the table makes it a platform; the drawer + approval keep the per-customer
receipts and the gated-spend trust story.
