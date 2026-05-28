import { useEffect, useRef, useState, useCallback } from "react";
import type { Event } from "@/types/protocol";
import { startMockStream, type MockController } from "@/lib/mockEvents";

const WS_URL = (sessionId: string) =>
  `ws://localhost:8000/ws/${encodeURIComponent(sessionId)}`;

export interface EventStream {
  events: Event[];
  connected: boolean;
  usingMock: boolean;
  sendApproval: (toolUseId: string, decision: "approve" | "deny") => void;
  sendKill: (reason: string) => void;
  resetMock: () => void;
}

/**
 * Subscribe to the agent event stream for a given session.
 * Tries the real backend WebSocket first; on error/close, falls back
 * to the local mock generator so the UI is always alive.
 */
export function useEventStream(sessionId: string): EventStream {
  const [events, setEvents] = useState<Event[]>([]);
  const [connected, setConnected] = useState(false);
  const [usingMock, setUsingMock] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const mockRef = useRef<MockController | null>(null);

  const pushEvent = useCallback((e: Event) => {
    setEvents((prev) => [...prev, e]);
  }, []);

  const startMock = useCallback(() => {
    if (mockRef.current) return;
    setUsingMock(true);
    mockRef.current = startMockStream(sessionId, pushEvent);
  }, [sessionId, pushEvent]);

  useEffect(() => {
    let cancelled = false;
    let attemptedFallback = false;

    function fallbackToMock() {
      if (cancelled || attemptedFallback) return;
      attemptedFallback = true;
      setConnected(false);
      startMock();
    }

    try {
      const ws = new WebSocket(WS_URL(sessionId));
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        setUsingMock(false);
      };

      ws.onmessage = (msg) => {
        if (cancelled) return;
        try {
          const parsed = JSON.parse(msg.data) as Event;
          pushEvent(parsed);
        } catch {
          // swallow malformed frames; don't crash the UI
        }
      };

      ws.onerror = () => {
        fallbackToMock();
      };

      ws.onclose = () => {
        if (!attemptedFallback) {
          fallbackToMock();
        } else {
          setConnected(false);
        }
      };
    } catch {
      fallbackToMock();
    }

    return () => {
      cancelled = true;
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
      if (mockRef.current) {
        mockRef.current.stop();
        mockRef.current = null;
      }
    };
  }, [sessionId, pushEvent, startMock]);

  const sendApproval = useCallback(
    (toolUseId: string, decision: "approve" | "deny") => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Backend doesn't accept inbound WS messages — go through REST.
        // The agent loop is awaiting a future the /approve handler resolves.
        fetch("http://localhost:8000/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            tool_use_id: toolUseId,
            decision,
            note: decision === "deny" ? "Denied by operator." : null,
          }),
        }).catch(() => {
          /* swallow — UI already reflected the click optimistically */
        });
      } else if (mockRef.current) {
        if (decision === "approve") mockRef.current.approve(toolUseId);
        else mockRef.current.deny(toolUseId);
      }
    },
    [sessionId],
  );

  const sendKill = useCallback(
    (reason: string) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        fetch("http://localhost:8000/kill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, reason }),
        }).catch(() => {
          /* swallow */
        });
      } else if (mockRef.current) {
        mockRef.current.kill(reason);
      }
    },
    [sessionId],
  );

  const resetMock = useCallback(() => {
    if (mockRef.current) {
      setEvents([]);
      mockRef.current.reset();
    }
  }, []);

  return { events, connected, usingMock, sendApproval, sendKill, resetMock };
}
