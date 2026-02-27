"use client";

import Link from "next/link";

import type { LiveSession } from "@/components/resume-session-popover";

import { ArchiveChatButton } from "@/components/archive-chat-button";
import { StateBadgeInline } from "@/components/session-state-badge";
import { RightSidebarTrigger } from "@/components/ui/right-sidebar-trigger";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getTimeAgo } from "@/lib/utils";

import type { Tab } from "./tab-context";

import { useAgentTabs } from "./tab-context";

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
  return null; // session icon handled separately
}

export function AgentTabMobile({
  sessionStateMap,
}: {
  sessionStateMap: Map<string, LiveSession>;
}) {
  const { tabs, mobileOpen, setMobileOpen, closeTab, pinTab, pinnedTabs } =
    useAgentTabs();

  const activeCount = tabs.filter((t) => {
    if (t.type !== "session" || !t.sessionId) return false;
    const s = sessionStateMap.get(t.sessionId);
    return (
      s && s.state !== "done" && s.state !== "stopped" && s.state !== "error"
    );
  }).length;

  if (tabs.length === 0) return null;

  return (
    <>
      {/* Pill trigger row */}
      <div className="flex h-8 shrink-0 items-stretch border-b">
        <button
          className="flex flex-1 items-center gap-1.5 px-3 text-xs"
          onClick={() => setMobileOpen(true)}
        >
          {activeCount > 0 && (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          )}
          <span>
            {tabs.length} tab{tabs.length !== 1 ? "s" : ""}
          </span>
          <span className="text-muted-foreground">▾</span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5 border-l border-border/50 px-1.5">
          <ArchiveChatButton />
          <RightSidebarTrigger />
        </div>
      </div>

      {/* Bottom sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="bottom" className="max-h-[70vh]">
          <SheetHeader>
            <SheetTitle>Open Tabs</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-2 overflow-y-auto p-4">
            {tabs.map((tab) => {
              const session = tab.sessionId
                ? sessionStateMap.get(tab.sessionId)
                : undefined;
              const isPinned = pinnedTabs.some((t) => t.id === tab.id);

              return (
                <Link
                  key={tab.id}
                  href={tab.url}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-start gap-2.5 border p-3 transition-colors hover:bg-muted/50 active:bg-muted"
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
                    <div className="flex gap-1">
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
        </SheetContent>
      </Sheet>
    </>
  );
}
