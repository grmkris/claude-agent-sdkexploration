"use client";

import { useState } from "react";

import { ScopeBadge } from "@/components/skills-mcps/scope-badge";
import {
  ToolInspectionPanel,
  type McpTool,
} from "@/components/skills-mcps/tool-inspection-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { MCP_CATALOG } from "@/lib/mcp-catalog";
import { cn } from "@/lib/utils";

type McpScope = "user" | "local" | "project";

export interface McpToolResult {
  tools: McpTool[];
  error?: string;
}

// Cross-reference catalog for emoji + description
const catalogLookup = new Map(MCP_CATALOG.map((e) => [e.id, e]));

function XIcon({ className }: { className?: string }) {
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
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function McpServerCard({
  name,
  scope,
  config,
  slug: _slug,
  isSystem = false,
  toolResult,
  isInspecting = false,
  onInspect,
  onRemove,
  compact = false,
}: {
  name: string;
  scope: McpScope;
  config?: Record<string, unknown>;
  slug?: string;
  isSystem?: boolean;
  toolResult?: McpToolResult | null;
  isInspecting?: boolean;
  onInspect?: () => void;
  onRemove?: () => void;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const catalogEntry = catalogLookup.get(name);
  const serverType = (config?.type as string) ?? "stdio";
  const cmd = config?.command as string | undefined;
  const sUrl = config?.url as string | undefined;

  // Health status dot
  const statusColor = toolResult
    ? toolResult.error
      ? "bg-red-400"
      : "bg-green-400"
    : "bg-muted-foreground/30";

  const canRemove =
    !isSystem && (scope === "local" || scope === "project" || scope === "user");

  const handleToggle = () => {
    if (expanded) {
      setExpanded(false);
    } else {
      setExpanded(true);
      if (!toolResult && !isInspecting) {
        onInspect?.();
      }
    }
  };

  // ── Compact mode (sidebar) ──
  if (compact) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton onClick={handleToggle} isActive={expanded}>
          <span className="flex items-center gap-1.5 min-w-0">
            <span
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusColor)}
            />
            {catalogEntry && (
              <span className="shrink-0 text-xs">{catalogEntry.emoji}</span>
            )}
            <span className="truncate">{name}</span>
          </span>
          {toolResult && !isInspecting && (
            <span
              className={cn(
                "ml-auto shrink-0 text-[10px]",
                toolResult.error ? "text-red-400" : "text-green-400"
              )}
            >
              {toolResult.error
                ? "\u2717 error"
                : `\u2713 ${toolResult.tools.length} tools`}
            </span>
          )}
          {isInspecting && (
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
              connecting\u2026
            </span>
          )}
          {canRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove?.();
              }}
              title="Remove MCP server"
              className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </SidebarMenuButton>
        {expanded && (
          <div className="border-t border-sidebar-border">
            {isInspecting ? (
              <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                Connecting to MCP server\u2026
              </p>
            ) : toolResult?.error ? (
              <div className="px-2 py-1.5">
                <p className="text-[11px] text-red-400 overflow-auto max-h-24">
                  {toolResult.error}
                </p>
              </div>
            ) : toolResult?.tools.length === 0 ? (
              <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                No tools exposed
              </p>
            ) : (
              <div className="py-1">
                {toolResult?.tools.map((tool) => (
                  <div
                    key={tool.name}
                    className="px-2 py-1 hover:bg-sidebar-accent/50"
                  >
                    <p className="font-mono text-[11px] text-foreground">
                      {tool.name}
                    </p>
                    {tool.description && (
                      <p className="text-[10px] text-muted-foreground">
                        {tool.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SidebarMenuItem>
    );
  }

  // ── Full-size card mode ──
  return (
    <div>
      <Card
        size="sm"
        className={cn(
          "cursor-pointer transition-colors hover:bg-accent/50",
          expanded && "ring-1 ring-foreground/20"
        )}
        onClick={handleToggle}
      >
        <CardContent className="flex items-center gap-2.5 py-3">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", statusColor)} />
          {catalogEntry && (
            <span className="shrink-0 text-base">{catalogEntry.emoji}</span>
          )}
          <span className="shrink-0 text-sm font-medium">{name}</span>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {serverType}
          </Badge>
          <ScopeBadge scope={scope} />
          {isSystem && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              System
            </Badge>
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground font-mono">
            {cmd ?? sUrl ?? ""}
          </span>
          {toolResult && !toolResult.error && (
            <span className="shrink-0 text-[10px] text-green-400">
              {toolResult.tools.length} tools
            </span>
          )}
          {toolResult?.error && (
            <span className="shrink-0 text-[10px] text-red-400">error</span>
          )}
          {isInspecting && (
            <span className="shrink-0 text-[10px] text-muted-foreground animate-pulse">
              connecting\u2026
            </span>
          )}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="xs"
              variant="outline"
              className="h-5 px-2 text-[10px]"
              onClick={(e) => {
                e.stopPropagation();
                onInspect?.();
              }}
            >
              Tools
            </Button>
            {canRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove?.();
                }}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                title="Remove"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </CardContent>
      </Card>
      {expanded && toolResult && (
        <ToolInspectionPanel
          tools={toolResult.tools}
          error={toolResult.error}
        />
      )}
      {expanded && isInspecting && !toolResult && (
        <div className="ml-4 py-2 text-xs text-muted-foreground animate-pulse">
          Connecting to server...
        </div>
      )}
    </div>
  );
}
