"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import type { LiveSession } from "@/components/resume-session-popover";
import { orpc } from "@/lib/orpc";

import { AgentTabItem } from "./agent-tab-item";
import { AgentTabMobile } from "./agent-tab-mobile";
import { useAgentTabs } from "./tab-context";

export function AgentTabBar() {
  const {
    openTabs,
    pinnedTabs,
    visible,
    isMobile,
    openTab,
  } = useAgentTabs();

  const { data: liveSessions = [] } = useQuery({
    ...orpc.liveState.active.queryOptions(),
    refetchInterval: 10_000,
  });

  const { data: projects = [] } = useQuery(orpc.projects.list.queryOptions());

  // Auto-add active sessions to open tabs
  React.useEffect(() => {
    for (const session of liveSessions as LiveSession[]) {
      const isActive =
        session.state !== "done" &&
        session.state !== "stopped" &&
        session.state !== "error";
      if (isActive) {
        openTab(session.session_id);
      }
    }
  }, [liveSessions, openTab]);

  // Build session map for quick lookup
  const sessionMap = React.useMemo(() => {
    const map = new Map<string, LiveSession>();
    for (const s of liveSessions as LiveSession[]) {
      map.set(s.session_id, s);
    }
    return map;
  }, [liveSessions]);

  // Collect all tab session IDs (pinned first, then open)
  const allTabIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const id of pinnedTabs) set.add(id);
    for (const id of openTabs) set.add(id);
    return Array.from(set);
  }, [pinnedTabs, openTabs]);

  // Filter to only tabs that have session data
  const pinnedSessions = pinnedTabs
    .map((id) => sessionMap.get(id))
    .filter(Boolean) as LiveSession[];
  const openSessions = openTabs
    .map((id) => sessionMap.get(id))
    .filter(Boolean) as LiveSession[];
  const allSessions = [...pinnedSessions, ...openSessions];

  // Hide when no tabs and no active sessions
  if (allTabIds.length === 0 && liveSessions.length === 0) return null;
  if (allSessions.length === 0) return null;

  // Mobile: pill + bottom sheet
  if (isMobile) {
    return (
      <AgentTabMobile sessions={allSessions} projects={projects} />
    );
  }

  // Desktop: hidden via Cmd+J toggle
  if (!visible) return null;

  return (
    <div
      data-slot="agent-tab-bar"
      className="flex h-9 shrink-0 items-stretch border-b bg-background overflow-x-auto scrollbar-none"
    >
      {/* Pinned tabs */}
      {pinnedSessions.map((session) => (
        <AgentTabItem
          key={session.session_id}
          session={session}
          projects={projects}
          pinned
        />
      ))}

      {/* Separator between pinned and open */}
      {pinnedSessions.length > 0 && openSessions.length > 0 && (
        <div className="mx-0.5 my-2 w-px bg-border" />
      )}

      {/* Open tabs */}
      {openSessions.map((session) => (
        <AgentTabItem
          key={session.session_id}
          session={session}
          projects={projects}
        />
      ))}

      {/* Spacer */}
      <div className="flex-1" />
    </div>
  );
}
