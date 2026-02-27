"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function useLiveUpdates() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.onmessage = (ev) => {
      console.log("[live-updates] SSE event:", ev.data);
      // Invalidate all session-related queries on any state change
      void queryClient.invalidateQueries({
        queryKey: ["activeSessions"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["sessionLiveState"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["projectSessions"],
      });
      // Invalidate orpc-generated keys for session listing procedures
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          // Match orpc keys like ["sessions","list"], ["sessions","recent"],
          // ["sessions","timeline"], ["root","sessions"],
          // and ["liveState","active"], ["liveState","session"], etc.
          if (Array.isArray(key) && key.length >= 1) {
            if (key[0] === "liveState") return true;
          }
          if (Array.isArray(key) && key.length >= 2) {
            if (key[0] === "sessions") return true;
            if (key[0] === "root" && key[1] === "sessions") return true;
          }
          return false;
        },
      });
    };

    es.onerror = (err) => {
      console.warn("[live-updates] SSE error/reconnect:", err);
    };

    return () => es.close();
  }, [queryClient]);
}
