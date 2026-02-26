"use client";

import Link from "next/link";
import * as React from "react";

import type { LiveSession } from "@/components/resume-session-popover";

import { StateBadgeInline } from "@/components/session-state-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, getTimeAgo } from "@/lib/utils";

import type { Tab } from "./tab-context";

import { useAgentTabs } from "./tab-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveProjectShortName(
  projectSlug: string | undefined
): string | null {
  if (!projectSlug) return null;
  return projectSlug.split("/").pop() ?? projectSlug;
}

function TabTooltipBody({ tab, session }: { tab: Tab; session?: LiveSession }) {
  return (
    <div className="flex flex-col gap-1">
      {session && (
        <div className="flex items-center gap-1.5">
          <StateBadgeInline
            state={session.state}
            currentTool={session.current_tool}
            updatedAt={session.updated_at}
          />
        </div>
      )}
      <p className="max-w-[200px] truncate text-xs font-medium">{tab.title}</p>
      {tab.projectSlug && (
        <p className="truncate text-[10px] text-muted-foreground">
          {tab.projectSlug}
        </p>
      )}
      {session && (
        <span className="text-[10px] text-muted-foreground">
          {getTimeAgo(session.updated_at)}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons by tab type
// ---------------------------------------------------------------------------

function TabIcon({ tab, session }: { tab: Tab; session?: LiveSession }) {
  if (tab.type === "session" && session) {
    return (
      <StateBadgeInline
        state={session.state}
        currentTool={session.current_tool}
        compact
      />
    );
  }

  if (tab.type === "session") {
    // No live data — show gray dot
    return (
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
    );
  }

  if (tab.type === "project") {
    return (
      <svg
        className="h-3 w-3 text-muted-foreground"
        viewBox="0 0 16 16"
        fill="currentColor"
      >
        <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z" />
      </svg>
    );
  }

  // page type
  return (
    <svg
      className="h-3 w-3 text-muted-foreground"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M3 1.75C3 .784 3.784 0 4.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-8.5A1.75 1.75 0 0 1 3 14.25V1.75Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentTabItem({
  tab,
  sessionStateMap,
}: {
  tab: Tab;
  sessionStateMap?: Map<string, LiveSession>;
}) {
  const { activeTab, closeTab, pinTab, unpinTab, setActiveTab } =
    useAgentTabs();
  const isActive = activeTab?.id === tab.id;
  const session = tab.sessionId
    ? sessionStateMap?.get(tab.sessionId)
    : undefined;
  const isEnded =
    session?.state === "done" ||
    session?.state === "stopped" ||
    session?.state === "error";
  const shortName = resolveProjectShortName(tab.projectSlug);

  const handleContextMenu = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (tab.pinned) {
        unpinTab(tab.id);
      } else {
        pinTab(tab.id);
      }
    },
    [tab.pinned, tab.id, pinTab, unpinTab]
  );

  // ---- Pinned tab (compact) ----
  if (tab.pinned) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<div />}>
            <Link
              href={tab.url}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={handleContextMenu}
              className={cn(
                "flex h-full shrink-0 items-center gap-1 border-r px-2 text-xs transition-colors",
                "hover:bg-muted/50",
                isActive && "border-b-2 border-b-primary bg-muted/30",
                isEnded && "opacity-50"
              )}
            >
              <TabIcon tab={tab} session={session} />
              {shortName && (
                <span className="text-[10px] font-medium uppercase text-muted-foreground">
                  {shortName.slice(0, 2)}
                </span>
              )}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <TabTooltipBody tab={tab} session={session} />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // ---- Regular tab ----
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<div />}>
          <Link
            href={tab.url}
            onClick={() => setActiveTab(tab.id)}
            onContextMenu={handleContextMenu}
            className={cn(
              "flex h-full shrink-0 items-center gap-1.5 border-r px-2.5 text-xs transition-colors",
              "hover:bg-muted/50",
              isActive && "border-b-2 border-b-primary bg-muted/30",
              isEnded && "opacity-60"
            )}
          >
            <TabIcon tab={tab} session={session} />
            <span className="max-w-[140px] truncate text-xs">{tab.title}</span>
            {shortName && tab.type === "session" && (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {shortName}
              </span>
            )}
            <button
              className="ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              ×
            </button>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <TabTooltipBody tab={tab} session={session} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
