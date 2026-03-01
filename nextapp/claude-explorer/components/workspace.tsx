"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import * as React from "react";

import { SessionPane } from "@/components/session-pane";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { useWorkspace, type WorkspacePanel } from "@/lib/workspace-context";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_PANEL_WIDTH_PX = 450;

// ---------------------------------------------------------------------------
// PanelHeader — compact header per panel
// ---------------------------------------------------------------------------

function PanelHeader({
  panel,
  isFocused,
  onClose,
}: {
  panel: WorkspacePanel;
  isFocused: boolean;
  onClose: () => void;
}) {
  const { data } = useQuery({
    ...orpc.liveState.session.queryOptions({
      input: { sessionId: panel.sessionId ?? "" },
    }),
    enabled: !!panel.sessionId,
    refetchInterval: 5_000,
  });

  const title =
    data?.first_prompt ?? (panel.sessionId ? "Loading..." : "New conversation");
  const isActive =
    data?.state && !["done", "stopped", "error"].includes(data.state);

  // Abbreviate model
  const modelShort = data?.model
    ? data.model.replace(/^claude-/, "").replace(/-\d{8}$/, "")
    : null;

  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 border-b px-2 text-xs",
        isFocused ? "bg-muted/50 border-b-primary/20" : "bg-background"
      )}
    >
      {/* Activity dot */}
      {isActive && (
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-green-500 animate-pulse" />
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

      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="shrink-0 rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Close panel"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={12} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace — the main horizontally scrolling multi-panel view
// ---------------------------------------------------------------------------

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
    // Open the fork as a new panel in the workspace
    // TODO: pass fork params through to SessionPane
    openNewSession(panelProjectSlug);
  };

  return (
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
                  {panels.length > 1 && (
                    <PanelHeader
                      panel={panel}
                      isFocused={panel.id === focusedPanelId}
                      onClose={() => closePanel(panel.id)}
                    />
                  )}
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
  );
}
