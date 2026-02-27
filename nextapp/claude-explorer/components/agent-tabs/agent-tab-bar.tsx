"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import type { LiveSession } from "@/components/resume-session-popover";

import { ArchiveChatButton } from "@/components/archive-chat-button";
import { getSessionUrl } from "@/components/resume-session-popover";
import { RightSidebarTrigger } from "@/components/ui/right-sidebar-trigger";
import { orpc } from "@/lib/orpc";

import { AgentTabItem } from "./agent-tab-item";
import { AgentTabMobile } from "./agent-tab-mobile";
import { useAgentTabs } from "./tab-context";

export function AgentTabBar() {
  const {
    tabs,
    pinnedTabs,
    openTabs,
    visible,
    isMobile,
    openTab,
    updateTabTitle,
  } = useAgentTabs();

  const { data: liveSessions = [] } = useQuery({
    ...orpc.liveState.active.queryOptions(),
    refetchInterval: 10_000,
  });

  const { data: projects = [] } = useQuery(orpc.projects.list.queryOptions());

  // Build session state map
  const sessionStateMap = React.useMemo(() => {
    const map = new Map<string, LiveSession>();
    for (const s of liveSessions as LiveSession[]) {
      map.set(s.session_id, s);
    }
    return map;
  }, [liveSessions]);

  // Auto-add active live sessions as tabs
  React.useEffect(() => {
    for (const session of liveSessions as LiveSession[]) {
      const isActive =
        session.state !== "done" &&
        session.state !== "stopped" &&
        session.state !== "error";
      if (isActive) {
        const url = getSessionUrl(session, projects);
        const projectSlug = session.project_path
          ? projects.find(
              (p) =>
                session.project_path === p.path ||
                session.project_path?.startsWith(p.path + "/")
            )?.slug
          : undefined;
        openTab({
          url,
          title: session.first_prompt ?? "Session starting...",
          type: "session",
          sessionId: session.session_id,
          projectSlug,
        });
      }
    }
  }, [liveSessions, projects, openTab]);

  // Update session tab titles from live data
  React.useEffect(() => {
    for (const tab of tabs) {
      if (tab.type !== "session" || !tab.sessionId) continue;
      const session = sessionStateMap.get(tab.sessionId);
      if (
        session?.first_prompt &&
        tab.title !== session.first_prompt &&
        tab.title === "Session starting..."
      ) {
        updateTabTitle(tab.id, session.first_prompt);
      }
    }
  }, [tabs, sessionStateMap, updateTabTitle]);

  // Mobile: delegate
  if (isMobile) {
    return <AgentTabMobile sessionStateMap={sessionStateMap} />;
  }

  // Hidden via Cmd+J toggle
  if (!visible) return null;

  return (
    <div
      data-slot="agent-tab-bar"
      className="flex h-9 shrink-0 items-stretch border-b bg-background overflow-x-auto scrollbar-none"
    >
      {/* Pinned tabs */}
      {pinnedTabs.map((tab) => (
        <AgentTabItem
          key={tab.id}
          tab={tab}
          sessionStateMap={sessionStateMap}
        />
      ))}

      {/* Separator between pinned and open */}
      {pinnedTabs.length > 0 && openTabs.length > 0 && (
        <div className="mx-0.5 my-2 w-px bg-border" />
      )}

      {/* Open tabs */}
      {openTabs.map((tab) => (
        <AgentTabItem
          key={tab.id}
          tab={tab}
          sessionStateMap={sessionStateMap}
        />
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right action zone — sticky so it stays visible during horizontal tab scroll */}
      <div className="sticky right-0 flex shrink-0 items-center gap-0.5 border-l border-border/50 bg-background px-1.5">
        <ArchiveChatButton />
        <RightSidebarTrigger />
      </div>
    </div>
  );
}
