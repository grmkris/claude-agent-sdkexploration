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
// Shows a compact chip in the chat settings bar that opens a popover
// listing optional MCP servers as toggleable switches.
// ─────────────────────────────────────────────────────────────────────────────

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

  // Filter to only optional servers
  const optionalServers = (data?.servers ?? []).filter(
    (s) => s.mode === "optional"
  );

  // Don't render if there are no optional MCPs
  if (optionalServers.length === 0) return null;

  const selectedCount = settings.enabledOptionalMcps.length;
  const isActive = selectedCount > 0;

  function isSelected(server: { name: string; scope: string }): boolean {
    return settings.enabledOptionalMcps.some(
      (m) => m.name === server.name && m.scope === server.scope
    );
  }

  function toggleServer(server: {
    name: string;
    scope: "user" | "project" | "local";
  }) {
    const existing = settings.enabledOptionalMcps.find(
      (m) => m.name === server.name && m.scope === server.scope
    );
    let next: McpSelection[];
    if (existing) {
      next = settings.enabledOptionalMcps.filter(
        (m) => !(m.name === server.name && m.scope === server.scope)
      );
    } else {
      next = [
        ...settings.enabledOptionalMcps,
        { name: server.name, scope: server.scope },
      ];
    }
    onSettingsChange({ ...settings, enabledOptionalMcps: next });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={[
          "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          isActive
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
        MCPs{isActive ? ` +${selectedCount}` : ""}
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-64 p-0">
        <div className="border-b border-border/50 px-3 py-2">
          <p className="text-xs font-medium text-foreground">
            Optional MCP Servers
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Enable for this session only
          </p>
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {optionalServers.map((server) => {
            const checked = isSelected(server);
            return (
              <button
                key={`${server.scope}:${server.name}`}
                type="button"
                onClick={() =>
                  toggleServer(
                    server as {
                      name: string;
                      scope: "user" | "project" | "local";
                    }
                  )
                }
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted/50 transition-colors"
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
                <span className="flex-1 truncate">{server.name}</span>
                <span className="shrink-0 rounded bg-muted/70 px-1 py-0.5 text-[9px] text-muted-foreground">
                  {server.scope}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
