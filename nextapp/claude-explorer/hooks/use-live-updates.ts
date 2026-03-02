"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

const TERMINAL_STATES = new Set(["stopped", "completed", "error"]);

export function useLiveUpdates() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.onmessage = (ev) => {
      let sid: string | undefined;
      let state: string | undefined;
      try {
        const payload = JSON.parse(ev.data);
        sid = payload?.sessionId;
        state = payload?.state;
      } catch {
        // Ignore unparseable events (e.g. keepalive)
        return;
      }

      // Always refresh the active-sessions list (lightweight single query)
      void queryClient.invalidateQueries({
        queryKey: ["activeSessions"],
      });

      // Targeted: only invalidate liveState queries for the specific session
      if (sid) {
        void queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            if (!Array.isArray(key) || key.length < 2) return false;
            const path = key[0];
            const opts = key[1] as Record<string, unknown> | undefined;
            // Match orpc keys like [["liveState","session"], { input: { sessionId }, type: "query" }]
            if (
              Array.isArray(path) &&
              path[0] === "liveState" &&
              path[1] === "session"
            ) {
              const input = opts?.input as { sessionId?: string } | undefined;
              return input?.sessionId === sid;
            }
            return false;
          },
        });

        // Also invalidate liveState.active (the list of all active sessions)
        void queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            if (!Array.isArray(key) || key.length < 1) return false;
            const path = key[0];
            return (
              Array.isArray(path) &&
              path[0] === "liveState" &&
              path[1] === "active"
            );
          },
        });
      }

      // Refresh session list queries only on terminal state transitions
      if (state && TERMINAL_STATES.has(state)) {
        void queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            if (!Array.isArray(key) || key.length < 1) return false;
            const path = key[0];
            return Array.isArray(path) && path[0] === "sessions";
          },
        });
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects; no action needed
    };

    return () => es.close();
  }, [queryClient]);
}
