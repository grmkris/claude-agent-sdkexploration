"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { orpc } from "@/lib/orpc";

import type { ChatSettings, McpSelection } from "./chat-settings-bar";

// ─────────────────────────────────────────────────────────────────────────────
// OptionalMcpSelector
// Shows a compact chip in the chat settings bar that opens a popover listing
// ALL MCP servers with their enabled/disabled state for the current session.
// Default-mode servers are on unless explicitly disabled. Optional servers are
// off unless explicitly enabled.
// ─────────────────────────────────────────────────────────────────────────────

const EXPLORER_NAME =
  typeof window !== "undefined"
    ? // Client-side: check env var or fallback
      (process.env.NEXT_PUBLIC_INSTANCE_NAME ?? "claude-explorer")
    : "claude-explorer";

export function OptionalMcpSelector({
  slug,
  settings,
  onSettingsChange,
  disabled,
}: {
  slug?: string;
  settings: ChatSettings;
  onSettingsChange: (settings: ChatSettings) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const { data } = useQuery(
    orpc.mcpServers.getPreferences.queryOptions({
      input: { slug },
    })
  );

  // All servers except the system explorer MCP
  const allServers = (data?.servers ?? []).filter(
    (s) => s.name !== EXPLORER_NAME
  );

  // Don't render if there are no MCPs at all
  if (allServers.length === 0) return null;

  // Compute effective on/off state for each server
  function isServerEnabled(server: {
    name: string;
    scope: string;
    mode: string;
  }): boolean {
    if (server.mode === "default") {
      // Default servers are on unless explicitly disabled
      return !settings.disabledDefaultMcps.some(
        (m) => m.name === server.name && m.scope === server.scope
      );
    }
    // Optional servers are off unless explicitly enabled
    return settings.enabledOptionalMcps.some(
      (m) => m.name === server.name && m.scope === server.scope
    );
  }

  function toggleServer(server: {
    name: string;
    scope: "user" | "project" | "local";
    mode: string;
  }) {
    if (server.mode === "default") {
      const isDisabled = settings.disabledDefaultMcps.some(
        (m) => m.name === server.name && m.scope === server.scope
      );
      const next: McpSelection[] = isDisabled
        ? settings.disabledDefaultMcps.filter(
            (m) => !(m.name === server.name && m.scope === server.scope)
          )
        : [
            ...settings.disabledDefaultMcps,
            { name: server.name, scope: server.scope },
          ];
      onSettingsChange({ ...settings, disabledDefaultMcps: next });
    } else {
      const isEnabled = settings.enabledOptionalMcps.some(
        (m) => m.name === server.name && m.scope === server.scope
      );
      const next: McpSelection[] = isEnabled
        ? settings.enabledOptionalMcps.filter(
            (m) => !(m.name === server.name && m.scope === server.scope)
          )
        : [
            ...settings.enabledOptionalMcps,
            { name: server.name, scope: server.scope },
          ];
      onSettingsChange({ ...settings, enabledOptionalMcps: next });
    }
  }

  const enabledCount = allServers.filter((s) => isServerEnabled(s)).length;
  const totalCount = allServers.length;
  const hasOverrides =
    settings.disabledDefaultMcps.length > 0 ||
    settings.enabledOptionalMcps.length > 0;

  // Group by scope
  const byScope = new Map<string, typeof allServers>();
  for (const s of allServers) {
    const group = byScope.get(s.scope) ?? [];
    group.push(s);
    byScope.set(s.scope, group);
  }

  const scopeOrder = ["local", "project", "user"];
  const scopeLabel: Record<string, string> = {
    local: "Local",
    project: "Project",
    user: "User",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={[
          "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          hasOverrides
            ? "border-purple-500/30 bg-purple-500/15 text-purple-600 dark:text-purple-400"
            : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
          disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Plug icon */}
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22v-5" />
          <path d="M9 8V2" />
          <path d="M15 8V2" />
          <path d="M18 8v5a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8Z" />
        </svg>
        MCPs {enabledCount}/{totalCount}
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-72 p-0">
        <div className="border-b border-border/50 px-3 py-2">
          <p className="text-xs font-medium text-foreground">
            Session MCP Servers
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {enabledCount} of {totalCount} enabled for this session
          </p>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {scopeOrder.map((scope) => {
            const group = byScope.get(scope);
            if (!group?.length) return null;
            return (
              <div key={scope}>
                <div className="px-2 pb-0.5 pt-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {scopeLabel[scope]}
                </div>
                {group.map((server) => {
                  const checked = isServerEnabled(server);
                  return (
                    <button
                      key={`${server.scope}:${server.name}`}
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        toggleServer(
                          server as {
                            name: string;
                            scope: "user" | "project" | "local";
                            mode: string;
                          }
                        )
                      }
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50 disabled:opacity-50"
                    >
                      {/* Custom checkbox */}
                      <span
                        className={[
                          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors",
                          checked
                            ? "border-purple-500 bg-purple-500 text-white"
                            : "border-muted-foreground/40",
                        ].join(" ")}
                      >
                        {checked && (
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20,6 9,17 4,12" />
                          </svg>
                        )}
                      </span>
                      <span
                        className={[
                          "flex-1 truncate",
                          !checked ? "text-muted-foreground line-through" : "",
                        ].join(" ")}
                      >
                        {server.name}
                      </span>
                      {server.mode === "optional" && (
                        <span className="shrink-0 rounded bg-muted/70 px-1 py-0.5 text-[9px] text-muted-foreground">
                          optional
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
