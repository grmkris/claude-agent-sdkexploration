"use client";

import Link from "next/link";

import type { LiveSession } from "@/components/resume-session-popover";
import { getSessionUrl } from "@/components/resume-session-popover";
import { StateBadgeInline } from "@/components/session-state-badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Project } from "@/lib/types";
import { getTimeAgo } from "@/lib/utils";

import { useAgentTabs } from "./tab-context";

export function AgentTabMobile({
  sessions,
  projects,
}: {
  sessions: LiveSession[];
  projects: Project[];
}) {
  const { mobileOpen, setMobileOpen, closeTab, pinTab, pinnedTabs } =
    useAgentTabs();

  const activeCount = sessions.filter(
    (s) => s.state !== "done" && s.state !== "stopped" && s.state !== "error"
  ).length;

  if (sessions.length === 0) return null;

  return (
    <>
      {/* Pill trigger */}
      <button
        className="flex h-8 items-center gap-1.5 border-b px-3 text-xs"
        onClick={() => setMobileOpen(true)}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
        <span>
          {activeCount} active
        </span>
        <span className="text-muted-foreground">▾</span>
      </button>

      {/* Bottom sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="bottom" className="max-h-[70vh]">
          <SheetHeader>
            <SheetTitle>Active Sessions</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-2 overflow-y-auto p-4">
            {sessions.map((session) => {
              const url = getSessionUrl(session, projects);
              const isPinned = pinnedTabs.includes(session.session_id);
              return (
                <Link
                  key={session.session_id}
                  href={url}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-start gap-2.5 border p-3 transition-colors hover:bg-muted/50 active:bg-muted"
                >
                  <div className="pt-0.5">
                    <StateBadgeInline
                      state={session.state}
                      currentTool={session.current_tool}
                      compact
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {session.first_prompt ?? "Session starting..."}
                    </p>
                    {session.project_path && (
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {session.project_path.split("/").slice(-3).join("/")}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      {getTimeAgo(session.updated_at)}
                    </span>
                    <div className="flex gap-1">
                      {!isPinned && (
                        <button
                          className="text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            pinTab(session.session_id);
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
                          closeTab(session.session_id);
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
        </SheetContent>
      </Sheet>
    </>
  );
}
