#!/usr/bin/env bash
# Backup demo driver — fires the full agent arc and auto-approves the high-risk
# action after a 10s pause (so the audience sees the approval card).
#
# Usage:
#   bash scripts/demo-driver.sh
#
# Requires the backend running on :8000 and Python + httpx + websockets
# available (they are, via the uv-managed venv in backend/).
set -euo pipefail
SESSION="${SESSION:-demo-session}"
cd "$(dirname "$0")/../backend"

# shellcheck disable=SC1091
set -a; . ../.env; set +a

uv run python <<PY
import asyncio, json, httpx, websockets
SESSION = "${SESSION}"
PAUSE_BEFORE_APPROVE_S = 10

async def main():
    async with httpx.AsyncClient(timeout=120) as c:
        ws_task = asyncio.create_task(_watch_and_approve(c))
        await asyncio.sleep(0.3)
        r = await c.post(
            "http://localhost:8000/agent/run",
            json={
                "session_id": SESSION,
                "playbook": "attribution",
                "user_message": "Show me what you can do — run the full demo flow.",
            },
        )
        print(f"started session={SESSION} status={r.status_code}", flush=True)
        await ws_task

async def _watch_and_approve(c):
    async with websockets.connect(f"ws://localhost:8000/ws/{SESSION}") as ws:
        async for raw in ws:
            e = json.loads(raw)
            t = e["type"]
            if t == "oversight.approval_required":
                tu = e["data"]["tool_use_id"]
                tn = e["data"]["tool_name"]
                print(f"⚠ approval required: {tn} — pausing {PAUSE_BEFORE_APPROVE_S}s so the audience sees the queue", flush=True)
                await asyncio.sleep(PAUSE_BEFORE_APPROVE_S)
                r = await c.post(
                    "http://localhost:8000/approve",
                    json={"session_id": SESSION, "tool_use_id": tu,
                          "decision": "approve", "note": "approved on stage"},
                )
                print(f"✓ approved tool_use_id={tu} status={r.status_code}", flush=True)
            elif t == "agent.complete":
                print("✓ agent.complete", flush=True)
                return

asyncio.run(main())
PY
