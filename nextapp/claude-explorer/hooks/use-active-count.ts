"use client";

import { useQuery } from "@tanstack/react-query";

import type { LiveSession } from "@/components/resume-session-popover";

import { orpc } from "@/lib/orpc";

export function useActiveCount() {
  const { data: liveSessions = [] } = useQuery({
    ...orpc.liveState.active.queryOptions(),
    refetchInterval: 10_000,
  });

  return (liveSessions as LiveSession[]).filter(
    (s) => s.state !== "done" && s.state !== "stopped" && s.state !== "error"
  ).length;
}
