"use client";

import Link from "next/link";
import * as React from "react";

import type { LiveSession } from "@/components/resume-session-popover";
import { getSessionUrl } from "@/components/resume-session-popover";
import { StateBadgeInline } from "@/components/session-state-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Project } from "@/lib/types";
import { cn, getTimeAgo } from "@/lib/utils";

import { useAgentTabs } from "./tab-context";

function resolveProjectShortName(
  projectPath: string | null,
  projects: Project[]
): string | null {
  if (!projectPath) return null;
  const match = projects.find(
    (p) => projectPath === p.path || projectPath.startsWith(p.path + "/")
  );
  if (!match) return null;
  return match.path.split("/").pop() ?? match.slug;
}

function TabTooltipContent({ session, prompt }: { session: LiveSession; prompt: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <StateBadgeInline
          state={session.state}
          currentTool={session.current_tool}
          updatedAt={session.updated_at}
        />
      </div>
      <p className="max-w-[200px] truncate text-xs font-medium">{prompt}</p>
      {session.project_path && (
        <p className="truncate text-[10px] text-muted-foreground">
          {session.project_path.split("/").slice(-3).join("/")}
        </p>
      )}
      <span className="text-[10px] text-muted-foreground">
        {getTimeAgo(session.updated_at)}
      </span>
    </div>
  );
}

export function AgentTabItem({
  session,
  projects,
  pinned,
}: {
  session: LiveSession;
  projects: Project[];
  pinned?: boolean;
}) {
  const { activeTab, closeTab, pinTab, unpinTab } = useAgentTabs();
  const isActive = activeTab === session.session_id;
  const url = getSessionUrl(session, projects);
  const shortName = resolveProjectShortName(session.project_path, projects);
  const prompt = session.first_prompt ?? "Session starting...";
  const isEnded = session.state === "done" || session.state === "stopped" || session.state === "error";

  const handleContextMenu = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (pinned) {
        unpinTab(session.session_id);
      } else {
        pinTab(session.session_id);
      }
    },
    [pinned, session.session_id, pinTab, unpinTab]
  );

  if (pinned) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<div />}>
            <Link
              href={url}
              className={cn(
                "flex h-full shrink-0 items-center gap-1 border-r px-2 text-xs transition-colors",
                "hover:bg-muted/50",
                isActive && "border-b-2 border-b-primary bg-muted/30",
                isEnded && "opacity-50"
              )}
              onContextMenu={handleContextMenu}
            >
              <StateBadgeInline
                state={session.state}
                currentTool={session.current_tool}
                compact
              />
              {shortName && (
                <span className="text-[10px] font-medium uppercase text-muted-foreground">
                  {shortName.slice(0, 2)}
                </span>
              )}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <TabTooltipContent session={session} prompt={prompt} />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Regular (non-pinned) tab
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<div />}>
          <Link
            href={url}
            className={cn(
              "flex h-full shrink-0 items-center gap-1.5 border-r px-2.5 text-xs transition-colors",
              "hover:bg-muted/50",
              isActive && "border-b-2 border-b-primary bg-muted/30",
              isEnded && "opacity-60"
            )}
            onContextMenu={handleContextMenu}
          >
            <StateBadgeInline
              state={session.state}
              currentTool={session.current_tool}
              compact
            />
            <span className="max-w-[140px] truncate text-xs">
              {prompt}
            </span>
            {shortName && (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {shortName}
              </span>
            )}
            <button
              className="ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                closeTab(session.session_id);
              }}
            >
              ×
            </button>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <TabTooltipContent session={session} prompt={prompt} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
