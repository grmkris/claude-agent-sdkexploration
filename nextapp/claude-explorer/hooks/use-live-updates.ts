"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function useLiveUpdates() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.onmessage = () => {
      // Invalidate session-related queries on any state change
      void queryClient.invalidateQueries({
        queryKey: ["activeSessions"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["sessionLiveState"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["projectSessions"],
      });
    };

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => es.close();
  }, [queryClient]);
}
