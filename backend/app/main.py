"""FastAPI app — REST + WebSocket surface for the Aetheric cockpit.

Endpoints:
    POST /agent/run                     start an agent turn-loop (spawns task)
    POST /approve                       resolve a pending approval
    POST /kill                          kill switch — cancels the agent loop
    GET  /audit/{session_id}            read back the audit log for a session
    GET  /pending/{session_id}          list pending approvals for a session
    GET  /healthz                       liveness
    WS   /ws/{session_id}               live event stream
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .agent import runtime
from .config import settings
from .event_bus import bus
from .oversight import approval_queue, audit_log
from .protocol import (
    ApprovalDecisionRequest,
    Event,
    KillRequest,
    KillTriggered,
    RunAgentRequest,
)

logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
log = logging.getLogger("aetheric.main")


# Per-session running agent tasks, so /kill can cancel them.
_agent_tasks: dict[str, asyncio.Task] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    audit_task = asyncio.create_task(audit_log.audit_tap_consumer(), name="audit-tap")
    log.info(
        "Aetheric backend ready — model=%s anthropic=%s tavily=%s env=%s",
        settings.aetheric_model,
        settings.has_anthropic,
        settings.has_tavily,
        settings.app_env,
    )
    try:
        yield
    finally:
        audit_task.cancel()
        for t in _agent_tasks.values():
            t.cancel()
        await asyncio.gather(audit_task, *_agent_tasks.values(), return_exceptions=True)


app = FastAPI(
    title="Aetheric",
    version="0.1.0",
    description="AI-native attribution + media-buying agent with verifiable oversight.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz() -> dict:
    return {
        "ok": True,
        "model": settings.aetheric_model,
        "has_anthropic_key": settings.has_anthropic,
        "has_tavily_key": settings.has_tavily,
        "running_sessions": list(_agent_tasks.keys()),
    }


@app.post("/agent/run")
async def run_agent_endpoint(req: RunAgentRequest) -> dict:
    session_id = req.session_id or uuid4().hex[:16]
    if session_id in _agent_tasks and not _agent_tasks[session_id].done():
        raise HTTPException(409, f"session {session_id} is already running")

    async def _wrapped():
        try:
            await runtime.run_agent(
                session_id=session_id,
                playbook=req.playbook,
                user_message=req.user_message,
            )
        except asyncio.CancelledError:
            log.info("agent task cancelled for session=%s", session_id)
            raise
        except Exception as exc:
            log.exception("agent task crashed for session=%s", session_id)
            await bus.publish(
                Event.make(
                    session_id,
                    "session.error",
                    {"error": repr(exc)},
                )
            )

    task = asyncio.create_task(_wrapped(), name=f"agent-{session_id}")
    _agent_tasks[session_id] = task
    task.add_done_callback(lambda _t: _agent_tasks.pop(session_id, None))

    return {"session_id": session_id, "playbook": req.playbook.value}


@app.post("/approve")
async def approve_endpoint(req: ApprovalDecisionRequest) -> dict:
    ok = approval_queue.queue.resolve(req.tool_use_id, req.decision, req.note)
    if not ok:
        raise HTTPException(404, f"no pending approval for tool_use_id={req.tool_use_id}")
    return {"ok": True}


@app.post("/kill")
async def kill_endpoint(req: KillRequest) -> dict:
    task = _agent_tasks.get(req.session_id)
    if not task or task.done():
        raise HTTPException(404, f"no running agent task for session={req.session_id}")
    task.cancel()
    await bus.publish(
        Event.make(req.session_id, "oversight.kill_triggered", KillTriggered(reason=req.reason))
    )
    return {"ok": True}


@app.get("/audit/{session_id}")
async def audit_endpoint(session_id: str, limit: int = 500) -> dict:
    events = audit_log.read_session(session_id, limit=limit)
    return {"session_id": session_id, "count": len(events), "events": [e.model_dump(mode="json") for e in events]}


@app.get("/pending/{session_id}")
async def pending_endpoint(session_id: str) -> dict:
    items = approval_queue.queue.list_for_session(session_id)
    return {
        "session_id": session_id,
        "pending": [
            {
                "tool_use_id": p.tool_use_id,
                "tool_name": p.tool_name,
                "tool_input": p.tool_input,
                "risk_reason": p.risk_reason,
            }
            for p in items
        ],
    }


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()
    queue = bus.subscribe(session_id)
    try:
        # Replay recent audit history so clients that connect mid-run get context.
        for prior in audit_log.read_session(session_id, limit=200):
            await websocket.send_text(prior.model_dump_json())

        while True:
            event = await queue.get()
            await websocket.send_text(event.model_dump_json())
    except WebSocketDisconnect:
        log.info("ws disconnected session=%s", session_id)
    except Exception:
        log.exception("ws crashed session=%s", session_id)
    finally:
        bus.unsubscribe(session_id, queue)
