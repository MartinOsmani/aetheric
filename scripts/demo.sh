#!/usr/bin/env bash
# Clean-take launcher for the Aetheric demo recording.
#
# Generates a FRESH session id (so the cockpit opens empty — no replayed
# history), prints the URL to open, waits for you to start recording, then
# launches the live agent into that session.
#
# Prereqs: backend running on :8000, frontend on :5173 (make backend / make frontend).

set -euo pipefail

BACKEND="http://localhost:8000"
FRONTEND="http://localhost:5173"
SID="demo-$(date +%H%M%S)"

MESSAGE="Review our conversion book for the operator: first surface our held-out attribution accuracy, then list the converting journeys, attribute a representative one and read the per-touchpoint credit, and finally propose a budget shift away from the lowest-credit channel toward the highest. Pause for my approval before moving any spend."

# Sanity checks
if ! curl -sf --max-time 5 "$BACKEND/healthz" >/dev/null; then
  echo "✗ Backend not reachable at $BACKEND — run 'make backend' first." >&2
  exit 1
fi
if ! curl -sf --max-time 5 "$FRONTEND" >/dev/null; then
  echo "✗ Frontend not reachable at $FRONTEND — run 'make frontend' first." >&2
  exit 1
fi

echo
echo "  Fresh session: $SID"
echo "  1. Open this URL (cockpit starts empty):"
echo
echo "       $FRONTEND/?session=$SID"
echo
echo "  2. Start your screen recording."
echo "  3. Press ENTER here to launch the live agent into that session."
echo
read -r

curl -sf -X POST "$BACKEND/agent/run" \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$SID\",\"playbook\":\"attribution\",\"user_message\":$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$MESSAGE")}" >/dev/null

echo "  ✓ Agent launched into $SID. Narrate as it populates."
echo "    When propose_budget_shift fires, the approval modal blocks — click Approve on camera."
echo "    Then drill into an ATTRIBUTED row (Aetheric-says column filled) to show the credit detail."
