"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import type { LiveSession } from "@/components/resume-session-popover";

import { ACTIVE_STATES, formatTokens } from "@/components/context-bar";
import { ConversationsPopover } from "@/components/conversations-popover";
import { RightSidebarTrigger } from "@/components/ui/right-sidebar-trigger";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";
import { useCompact } from "@/lib/session-compact-context";

import { AgentTabMobile } from "./agent-tab-mobile";
import { useAgentTabs } from "./tab-context";

// ---------------------------------------------------------------------------
// SessionInfoBar — shown in the center slot when a session tab is active
// ---------------------------------------------------------------------------

function SessionInfoBar({ sessionId }: { sessionId: string }) {
  const { onCompact } = useCompact();

  const { data } = useQuery({
    ...orpc.liveState.session.queryOptions({ input: { sessionId } }),
    refetchInterval: 5_000,
  });

  // Tick every second while session is active so elapsed time is live
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!data || !ACTIVE_STATES.has(data.state)) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [data?.state]);

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
    refetchInterval: 10_000,
  });

  const { data: projects = [] } = useQuery(orpc.projects.list.queryOptions());

  const { data: recentSessions = [] } = useQuery({
    ...orpc.sessions.timeline.queryOptions({
      input: { limit: 50 },
    }),
    refetchInterval: 15_000,
  });

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

  // Build list of project slugs that appear in recent sessions (for filter chips)
  const projectsWithSessions = React.useMemo(() => {
    const slugs = new Set<string>();
    for (const s of recentSessions) {
      if (s.projectSlug) slugs.add(s.projectSlug);
    }
    for (const s of liveSessions as LiveSession[]) {
      if (s.project_path) {
        const proj = projects.find(
          (p) =>
            s.project_path === p.path ||
            s.project_path?.startsWith(p.path + "/")
        );
        if (proj) slugs.add(proj.slug);
      }
    }
    return Array.from(slugs).sort();
  }, [recentSessions, liveSessions, projects]);

  // Mobile: delegate
  if (isMobile) {
    return (
      <AgentTabMobile
        sessionStateMap={sessionStateMap}
        recentSessions={recentSessions}
        projects={projects}
        projectsWithSessions={projectsWithSessions}
      />
    );
  }

  const activeCount = (liveSessions as LiveSession[]).filter(
    (s) => s.state !== "done" && s.state !== "stopped" && s.state !== "error"
  ).length;

  const isSessionTab = activeTab?.type === "session" && !!activeTab.sessionId;

  const popoverTrigger = (
    <button
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
          <ConversationsPopover trigger={popoverTrigger} />
          <SessionInfoBar sessionId={activeTab.sessionId!} />
        </div>
      ) : (
        <ConversationsPopover trigger={popoverTrigger} />
      )}

      {/* RIGHT: right sidebar trigger (mobile only) */}
      <div className="flex shrink-0 items-center gap-0.5 border-l border-border/50 px-1.5 md:hidden">
        <RightSidebarTrigger />
      </div>
    </div>
  );
}
