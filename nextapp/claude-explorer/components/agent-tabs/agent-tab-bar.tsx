"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import * as React from "react";

import type { LiveSession } from "@/components/resume-session-popover";

import { ArchiveChatButton } from "@/components/archive-chat-button";
import { getSessionUrl } from "@/components/resume-session-popover";
import { StateBadgeInline } from "@/components/session-state-badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { RightSidebarTrigger } from "@/components/ui/right-sidebar-trigger";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { orpc } from "@/lib/orpc";
import { getTimeAgo } from "@/lib/utils";

import type { Tab } from "./tab-context";

import { AgentTabMobile } from "./agent-tab-mobile";
import { useAgentTabs } from "./tab-context";

// ---------------------------------------------------------------------------
// Tab icon (reused from mobile)
// ---------------------------------------------------------------------------

function TabIcon({ tab }: { tab: Tab }) {
  if (tab.type === "project") {
    return (
      <svg
        className="h-3.5 w-3.5 text-muted-foreground"
        viewBox="0 0 16 16"
        fill="currentColor"
      >
        <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z" />
      </svg>
    );
  }
  if (tab.type === "page") {
    return (
      <svg
        className="h-3.5 w-3.5 text-muted-foreground"
        viewBox="0 0 16 16"
        fill="currentColor"
      >
        <path d="M3 1.75C3 .784 3.784 0 4.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-8.5A1.75 1.75 0 0 1 3 14.25V1.75Z" />
      </svg>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgentTabBar() {
  const {
    tabs,
    pinnedTabs,
    isMobile,
    openTab,
    updateTabTitle,
    closeTab,
    pinTab,
  } = useAgentTabs();

  const [popoverOpen, setPopoverOpen] = React.useState(false);

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

  const activeCount = tabs.filter((t) => {
    if (t.type !== "session" || !t.sessionId) return false;
    const s = sessionStateMap.get(t.sessionId);
    return (
      s && s.state !== "done" && s.state !== "stopped" && s.state !== "error"
    );
  }).length;

  return (
    <div
      data-slot="agent-tab-bar"
      className="flex h-9 shrink-0 items-stretch border-b bg-background"
    >
      {/* LEFT: sidebar trigger */}
      <div className="flex shrink-0 items-center gap-0.5 border-r border-border/50 px-1.5">
        <SidebarTrigger />
      </div>

      {/* CENTER: running indicator / tab list trigger */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button className="flex flex-1 items-center justify-center gap-1.5 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {activeCount > 0 ? (
              <>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                <span>{activeCount} running</span>
              </>
            ) : tabs.length > 0 ? (
              <span>{tabs.length} session{tabs.length !== 1 ? "s" : ""}</span>
            ) : null}
          </button>
        </PopoverTrigger>

        {tabs.length > 0 && (
          <PopoverContent
            align="center"
            className="w-80 p-0"
            sideOffset={4}
          >
            <div className="flex flex-col max-h-[60vh] overflow-y-auto">
              {tabs.map((tab) => {
                const session = tab.sessionId
                  ? sessionStateMap.get(tab.sessionId)
                  : undefined;
                const isPinned = pinnedTabs.some((t) => t.id === tab.id);

                return (
                  <Link
                    key={tab.id}
                    href={tab.url}
                    onClick={() => setPopoverOpen(false)}
                    className="flex items-start gap-2.5 border-b last:border-b-0 px-3 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <div className="pt-0.5">
                      {session ? (
                        <StateBadgeInline
                          state={session.state}
                          currentTool={session.current_tool}
                          compact
                        />
                      ) : (
                        <TabIcon tab={tab} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{tab.title}</p>
                      {tab.projectSlug && (
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {tab.projectSlug}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {session && (
                        <span className="text-[10px] text-muted-foreground">
                          {getTimeAgo(session.updated_at)}
                        </span>
                      )}
                      <div className="flex gap-1.5">
                        {!isPinned && (
                          <button
                            className="text-[10px] text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              pinTab(tab.id);
                            }}
                          >
                            pin
                          </button>
                        )}
                        <button
                          className="text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            closeTab(tab.id);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </PopoverContent>
        )}
      </Popover>

      {/* RIGHT: archive + right sidebar trigger */}
      <div className="flex shrink-0 items-center gap-0.5 border-l border-border/50 px-1.5">
        <ArchiveChatButton />
        <RightSidebarTrigger />
      </div>
    </div>
  );
}
