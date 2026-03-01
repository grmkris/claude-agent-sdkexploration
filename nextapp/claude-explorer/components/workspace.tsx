"use client";

import {
  Add01Icon,
  Cancel01Icon,
  Folder01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import * as React from "react";

import { ACTIVE_STATES, formatTokens } from "@/components/context-bar";
import {
  ConversationsPopover,
  useActiveCount,
} from "@/components/conversations-popover";
import { SessionPane } from "@/components/session-pane";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { orpc } from "@/lib/orpc";
import { useCompact } from "@/lib/session-compact-context";
import { cn } from "@/lib/utils";
import { useWorkspace, type WorkspacePanel } from "@/lib/workspace-context";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_PANEL_WIDTH_PX = 450;

// ---------------------------------------------------------------------------
// PanelHeader — compact header per panel (enriched for focused panel)
// ---------------------------------------------------------------------------

function PanelHeader({
  panel,
  isFocused,
  panelIndex,
  panelCount,
  onSplit,
  onClose,
}: {
  panel: WorkspacePanel;
  isFocused: boolean;
  panelIndex: number;
  panelCount: number;
  onSplit: () => void;
  onClose: () => void;
}) {
  const { onCompact } = useCompact();
  const activeCount = useActiveCount();

  const { data } = useQuery({
    ...orpc.liveState.session.queryOptions({
      input: { sessionId: panel.sessionId ?? "" },
    }),
    enabled: !!panel.sessionId,
    refetchInterval: 5_000,
  });

  const title =
    data?.first_prompt ?? (panel.sessionId ? "Loading..." : "New conversation");
  const isActive = !!data?.state && ACTIVE_STATES.has(data.state);

  // Abbreviate model
  const modelShort = data?.model
    ? data.model.replace(/^claude-/, "").replace(/-\d{8}$/, "")
    : null;

  // Context window stats (focused panel only)
  const contextWindow = data?.context_window ?? null;
  const maxContextWindow = data?.max_context_window ?? null;
  const pct =
    contextWindow !== null && maxContextWindow !== null && maxContextWindow > 0
      ? contextWindow / maxContextWindow
      : null;

  const canCompact = !!onCompact && !isActive;

  const btnClass =
    "shrink-0 rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1.5 border-b px-2 text-xs",
        isFocused ? "h-9 bg-muted/50 border-b-primary/20" : "h-8 bg-background"
      )}
    >
      {/* Conversations popover trigger (focused panel only) */}
      {isFocused && (
        <ConversationsPopover
          trigger={
            <button
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
                activeCount === 0 && "opacity-40"
              )}
            >
              {activeCount > 0 ? (
                <>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span>{activeCount}</span>
                </>
              ) : (
                <span className="text-[10px]">☰</span>
              )}
            </button>
          }
        />
      )}

      {/* Activity dot */}
      {isActive && (
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-green-500 animate-pulse" />
      )}

      {/* Panel index indicator (multi-panel only) */}
      {panelCount > 1 && (
        <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[9px] text-foreground/40">
          {panelIndex + 1}/{panelCount}
        </span>
      )}

      {/* Title */}
      <span className="flex-1 truncate text-foreground/80 min-w-0">
        {title}
      </span>

      {/* Model pill */}
      {modelShort && (
        <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[9px] text-foreground/60">
          {modelShort}
        </span>
      )}

      {/* Context window % (focused panel only) */}
      {isFocused && pct !== null && (
        <span
          className={`shrink-0 tabular-nums text-[10px] ${
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

      {/* Token counts (focused panel only) */}
      {isFocused && data?.input_tokens != null && (
        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
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

      {/* Compact button (focused panel only) */}
      {isFocused && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (canCompact) onCompact?.();
          }}
          disabled={!canCompact}
          title={
            canCompact
              ? "Compact context (summarise history to free up context window)"
              : "Cannot compact while session is active"
          }
          className="shrink-0 flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-muted-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-muted enabled:hover:text-foreground"
        >
          <span>⟳</span>
          <span>Compact</span>
        </button>
      )}

      {/* Split button */}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSplit();
              }}
              className={btnClass}
              aria-label="Split view"
            />
          }
        >
          <HugeiconsIcon icon={Add01Icon} size={12} />
        </TooltipTrigger>
        <TooltipContent side="bottom">Split view (⌘\)</TooltipContent>
      </Tooltip>

      {/* Close button (multi-panel only) */}
      {panelCount > 1 && (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className={btnClass}
                aria-label="Close panel"
              />
            }
          >
            <HugeiconsIcon icon={Cancel01Icon} size={12} />
          </TooltipTrigger>
          <TooltipContent side="bottom">Close panel (⌘W)</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace — the main horizontally scrolling multi-panel view
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GroupBar — shows active group name above panels
// ---------------------------------------------------------------------------

function GroupBar() {
  const { activeGroupId, activeGroupName, clearGroup, saveAsGroup, panels } =
    useWorkspace();
  const [saving, setSaving] = React.useState(false);
  const [saveName, setSaveName] = React.useState("");

  const hasSessions = panels.some((p) => p.sessionId);

  if (activeGroupId) {
    return (
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/50 bg-muted/30 px-3 text-xs">
        <HugeiconsIcon
          icon={Folder01Icon}
          size={12}
          className="text-muted-foreground"
        />
        <span className="truncate text-muted-foreground">
          {activeGroupName ?? "Workspace Group"}
        </span>
        <button
          onClick={clearGroup}
          className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          Detach
        </button>
      </div>
    );
  }

  // No active group — show save option when panels have sessions
  if (!hasSessions || panels.length < 2) return null;

  if (saving) {
    return (
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/50 bg-muted/30 px-3 text-xs">
        <input
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder="Group name..."
          className="flex-1 min-w-0 bg-transparent text-xs focus:outline-none"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && saveName.trim()) {
              void saveAsGroup(saveName.trim());
              setSaving(false);
              setSaveName("");
            }
            if (e.key === "Escape") {
              setSaving(false);
              setSaveName("");
            }
          }}
        />
        <button
          onClick={() => {
            setSaving(false);
            setSaveName("");
          }}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={10} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-7 shrink-0 items-center justify-end border-b border-border/50 bg-muted/30 px-3">
      <button
        onClick={() => setSaving(true)}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <HugeiconsIcon icon={Folder01Icon} size={10} />
        Save as group
      </button>
    </div>
  );
}

export function Workspace({ children }: { children: React.ReactNode }) {
  const {
    panels,
    focusedPanelId,
    hasPanels,
    closePanel,
    focusPanel,
    updatePanelSession,
    openNewSession,
  } = useWorkspace();
  const pathname = usePathname();

  // Show workspace when we have panels AND the URL is a session/chat route
  const isSessionRoute = /\/chat(\/|$)/.test(pathname);
  const showWorkspace = hasPanels && isSessionRoute;

  // Ref for scroll-into-view on new panels
  const panelRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const prevPanelCount = React.useRef(panels.length);

  // Scroll new panels into view
  React.useEffect(() => {
    if (panels.length > prevPanelCount.current && focusedPanelId) {
      const el = panelRefs.current.get(focusedPanelId);
      el?.scrollIntoView({ behavior: "smooth", inline: "center" });
    }
    prevPanelCount.current = panels.length;
  }, [panels.length, focusedPanelId]);

  if (!showWorkspace) {
    return <>{children}</>;
  }

  const handleFork = (
    panelProjectSlug: string | undefined,
    _sessionId: string,
    _messageUuid: string
  ) => {
    openNewSession(panelProjectSlug);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <GroupBar />
      <div className="flex flex-1 overflow-x-auto overflow-y-hidden">
        <div
          className="flex h-full"
          style={{
            minWidth:
              panels.length > 1
                ? `${panels.length * MIN_PANEL_WIDTH_PX}px`
                : "100%",
          }}
        >
          <ResizablePanelGroup orientation="horizontal">
            {panels.map((panel, i) => (
              <React.Fragment key={panel.id}>
                {i > 0 && <ResizableHandle withHandle />}
                <ResizablePanel
                  minSize={
                    panels.length > 1
                      ? Math.max(15, (100 / panels.length) * 0.4)
                      : 100
                  }
                  defaultSize={100 / panels.length}
                >
                  <div
                    ref={(el) => {
                      if (el) panelRefs.current.set(panel.id, el);
                      else panelRefs.current.delete(panel.id);
                    }}
                    className={cn(
                      "flex flex-col h-full",
                      panels.length > 1 &&
                        "border-r border-border/30 last:border-r-0",
                      panel.id === focusedPanelId &&
                        panels.length > 1 &&
                        "ring-1 ring-inset ring-primary/20"
                    )}
                    onClick={() => focusPanel(panel.id)}
                  >
                    <PanelHeader
                      panel={panel}
                      isFocused={panel.id === focusedPanelId}
                      panelIndex={i}
                      panelCount={panels.length}
                      onSplit={() => openNewSession(panel.projectSlug)}
                      onClose={() => closePanel(panel.id)}
                    />
                    <SessionPane
                      sessionId={panel.sessionId}
                      projectSlug={panel.projectSlug}
                      isFocused={panel.id === focusedPanelId}
                      onSessionCreated={(sid) =>
                        updatePanelSession(panel.id, sid)
                      }
                      onFork={(sid, msgUuid) =>
                        handleFork(panel.projectSlug, sid, msgUuid)
                      }
                    />
                  </div>
                </ResizablePanel>
              </React.Fragment>
            ))}
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  );
}
