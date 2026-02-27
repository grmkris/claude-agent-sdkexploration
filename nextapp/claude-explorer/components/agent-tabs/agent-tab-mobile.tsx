"use client";

import Link from "next/link";
import * as React from "react";

import type { LiveSession } from "@/components/resume-session-popover";

import { StateBadgeInline } from "@/components/session-state-badge";
import { RightSidebarTrigger } from "@/components/ui/right-sidebar-trigger";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getTimeAgo } from "@/lib/utils";

import { useAgentTabs } from "./tab-context";

// Minimal type for recent sessions (matches RecentSession from schemas)
interface RecentSession {
  id: string;
  firstPrompt: string;
  lastModified: string;
  projectSlug: string | null;
  sessionState?: string;
}

export function AgentTabMobile({
  sessionStateMap,
  recentSessions = [],
  projects: _projects = [],
  projectsWithSessions = [],
}: {
  sessionStateMap: Map<string, LiveSession>;
  recentSessions?: RecentSession[];
  projects?: Array<{ slug: string; path: string }>;
  projectsWithSessions?: string[];
}) {
  const { mobileOpen, setMobileOpen } = useAgentTabs();

  const [selectedProjectSlug, setSelectedProjectSlug] = React.useState<
    string | null
  >(null);

  const activeCount = Array.from(sessionStateMap.values()).filter(
    (s) => s.state !== "done" && s.state !== "stopped" && s.state !== "error"
  ).length;

  // Filter sessions by selected project
  const filteredSessions = React.useMemo(() => {
    if (!selectedProjectSlug) return recentSessions;
    return recentSessions.filter((s) => s.projectSlug === selectedProjectSlug);
  }, [recentSessions, selectedProjectSlug]);

  return (
    <>
      {/* Trigger row */}
      <div className="flex h-8 shrink-0 items-stretch border-b">
        {/* LEFT: left sidebar trigger (nav / project explorer) */}
        <div className="flex shrink-0 items-center gap-0.5 border-r border-border/50 px-1.5">
          <SidebarTrigger />
        </div>
        {/* CENTER: conversations trigger */}
        <button
          className="flex flex-1 items-center justify-center gap-1.5 px-3 text-xs text-muted-foreground"
          onClick={() => setMobileOpen(true)}
        >
          {activeCount > 0 ? (
            <>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span>{activeCount} running</span>
            </>
          ) : (
            <span>Conversations</span>
          )}
        </button>
        {/* RIGHT: right sidebar trigger (recent sessions) */}
        <div className="flex shrink-0 items-center gap-0.5 border-l border-border/50 px-1.5">
          <RightSidebarTrigger />
        </div>
      </div>

      {/* Bottom sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle>Recent Conversations</SheetTitle>
          </SheetHeader>

          {/* Project filter chips */}
          {projectsWithSessions.length > 0 && (
            <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b pb-3 scrollbar-none">
              <button
                onClick={() => setSelectedProjectSlug(null)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  selectedProjectSlug === null
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                All
              </button>
              {projectsWithSessions.map((slug) => (
                <button
                  key={slug}
                  onClick={() =>
                    setSelectedProjectSlug(
                      selectedProjectSlug === slug ? null : slug
                    )
                  }
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    selectedProjectSlug === slug
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {slug.replace(/^-home-bun-projects-/, "").replace(/-/g, " ")}
                </button>
              ))}
            </div>
          )}

          {/* Session list */}
          <div className="flex flex-col gap-2 overflow-y-auto flex-1">
            {filteredSessions.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No conversations yet
              </div>
            ) : (
              filteredSessions.map((session) => {
                const liveSession = sessionStateMap.get(session.id);
                const url = session.projectSlug
                  ? `/project/${session.projectSlug}/chat/${session.id}`
                  : `/chat/${session.id}`;

                return (
                  <Link
                    key={session.id}
                    href={url}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-start gap-2.5 border p-3 transition-colors hover:bg-muted/50 active:bg-muted"
                  >
                    <div className="pt-0.5">
                      {liveSession ? (
                        <StateBadgeInline
                          state={liveSession.state}
                          currentTool={liveSession.current_tool}
                          compact
                        />
                      ) : (
                        <svg
                          className="h-3.5 w-3.5 text-muted-foreground/50"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                        >
                          <path d="M2.75 0h10.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 14H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 15.543V14H2.75A1.75 1.75 0 0 1 1 12.25V1.75C1 .784 1.784 0 2.75 0Z" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {session.firstPrompt || "Untitled session"}
                      </p>
                      {session.projectSlug && (
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {session.projectSlug
                            .replace(/^-home-bun-projects-/, "")
                            .replace(/-/g, " ")}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[10px] text-muted-foreground">
                        {getTimeAgo(session.lastModified)}
                      </span>
                      {liveSession && (
                        <span className="text-[10px] font-medium text-green-500">
                          live
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
