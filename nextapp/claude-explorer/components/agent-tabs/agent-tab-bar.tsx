"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import type { LiveSession } from "@/components/resume-session-popover";

import { ArchiveChatButton } from "@/components/archive-chat-button";
import { ACTIVE_STATES, formatTokens } from "@/components/context-bar";
import { RightSidebarTrigger } from "@/components/ui/right-sidebar-trigger";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCommandPalette } from "@/lib/command-palette-context";
import { orpc } from "@/lib/orpc";
import { useCompact } from "@/lib/session-compact-context";
import { useWorkspace } from "@/lib/workspace-context";

import { AgentTabMobile } from "./agent-tab-mobile";
import { useAgentTabs } from "./tab-context";

// ---------------------------------------------------------------------------
// ForkIcon — inline SVG
// ---------------------------------------------------------------------------

function ForkIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" />
      <path d="M12 12v3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// SessionInfoBar — shown in the center slot when a session tab is active
// ---------------------------------------------------------------------------

function SessionInfoBar({
  sessionId,
  projectSlug,
}: {
  sessionId: string;
  projectSlug?: string;
}) {
  const { onCompact } = useCompact();
  const { openForkPanel } = useWorkspace();

  const { data } = useQuery({
    ...orpc.liveState.session.queryOptions({ input: { sessionId } }),
    // SSE handles real-time updates — no polling needed
  });

  if (!data) return null;

  const contextWindow = data.context_window ?? null;
  const maxContextWindow = data.max_context_window ?? null;
  const pct =
    contextWindow !== null && maxContextWindow !== null && maxContextWindow > 0
      ? contextWindow / maxContextWindow
      : null;

  const isActive = ACTIVE_STATES.has(data.state);
  const canCompact = !!onCompact && !isActive;

  // Abbreviate model: strip "claude-" prefix and trailing date suffix like -20250219
  const modelShort = data.model
    ? data.model.replace(/^claude-/, "").replace(/-\d{8}$/, "")
    : null;

  return (
    <div className="flex flex-1 items-center gap-2 overflow-hidden px-3 min-w-0">
      {/* Initial prompt — takes all remaining space */}
      {data.first_prompt && (
        <span className="truncate text-sm text-foreground/80 min-w-0 flex-1">
          {data.first_prompt}
        </span>
      )}

      {/* Model pill */}
      {modelShort && (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">
          {modelShort}
        </span>
      )}

      {/* Context window % */}
      {pct !== null && (
        <span
          className={`shrink-0 tabular-nums text-[11px] ${
            pct >= 0.9
              ? "font-medium text-red-500"
              : pct >= 0.7
                ? "text-yellow-500"
                : "text-muted-foreground"
          }`}
        >
          {(pct * 100).toFixed(0)}%
        </span>
      )}

      {/* Token counts */}
      {data.input_tokens != null && (
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          <span className="text-muted-foreground/60">in </span>
          {formatTokens(data.input_tokens)}
          {data.output_tokens != null && (
            <>
              <span className="text-muted-foreground/60"> out </span>
              {formatTokens(data.output_tokens)}
            </>
          )}
        </span>
      )}

      {/* Compact button */}
      <button
        onClick={canCompact ? onCompact : undefined}
        disabled={!canCompact}
        title={
          canCompact
            ? "Compact context (summarise history to free up context window)"
            : "Cannot compact while session is active"
        }
        className="shrink-0 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-muted enabled:hover:text-foreground"
      >
        <span>⟳</span>
        <span>Compact</span>
      </button>

      {/* Archive button */}
      <ArchiveChatButton
        size="sm"
        sessionId={sessionId}
        projectSlug={projectSlug}
      />

      {/* Fork button — splits into multi-panel workspace */}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              onClick={() => openForkPanel(sessionId, projectSlug)}
              className="shrink-0 rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Fork session"
            />
          }
        >
          <ForkIcon className="h-3.5 w-3.5" />
        </TooltipTrigger>
        <TooltipContent side="bottom">Fork session</TooltipContent>
      </Tooltip>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgentTabBar() {
  const { tabs, isMobile, openTab, updateTabTitle, activeTab } = useAgentTabs();

  const { data: liveSessions = [] } = useQuery({
    ...orpc.liveState.active.queryOptions(),
    refetchInterval: 30_000,
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
        const url = session.project_path
          ? (() => {
              const proj = projects.find(
                (p) =>
                  session.project_path === p.path ||
                  session.project_path?.startsWith(p.path + "/")
              );
              return proj
                ? `/project/${proj.slug}/chat/${session.session_id}`
                : `/chat/${session.session_id}`;
            })()
          : `/chat/${session.session_id}`;
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
    return <AgentTabMobile />;
  }

  const { setOpen: openCommandPalette } = useCommandPalette();

  const activeCount = (liveSessions as LiveSession[]).filter(
    (s) => s.state !== "done" && s.state !== "stopped" && s.state !== "error"
  ).length;

  const isSessionTab = activeTab?.type === "session" && !!activeTab.sessionId;

  const conversationsButton = (
    <button
      onClick={() => openCommandPalette(true)}
      className={[
        isSessionTab
          ? "flex shrink-0 items-center gap-1 border-r border-border/50 px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          : "flex flex-1 items-center justify-center gap-1.5 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors",
        activeCount > 0 ? "" : isSessionTab ? "opacity-40" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {activeCount > 0 ? (
        <>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          <span>
            {activeCount}
            {!isSessionTab && " running"}
          </span>
        </>
      ) : isSessionTab ? (
        <span className="text-[10px]">☰</span>
      ) : (
        <span>Conversations</span>
      )}
    </button>
  );

  return (
    <div
      data-slot="agent-tab-bar"
      className="flex h-9 shrink-0 sticky top-0 z-10 items-stretch border-b bg-background"
    >
      {/* LEFT: sidebar trigger (mobile only) */}
      <div className="flex shrink-0 items-center gap-0.5 border-r border-border/50 px-1.5 md:hidden">
        <SidebarTrigger />
      </div>

      {/* CENTER */}
      {isSessionTab ? (
        <div className="flex flex-1 items-stretch overflow-hidden">
          {conversationsButton}
          <SessionInfoBar
            sessionId={activeTab.sessionId!}
            projectSlug={activeTab.projectSlug}
          />
        </div>
      ) : (
        conversationsButton
      )}

      {/* RIGHT: right sidebar trigger (mobile only) */}
      <div className="flex shrink-0 items-center gap-0.5 border-l border-border/50 px-1.5 md:hidden">
        <RightSidebarTrigger />
      </div>
    </div>
  );
}
