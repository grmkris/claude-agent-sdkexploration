"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { McpSelection } from "@/components/chat-settings-bar";
import type { SessionMcpConfig } from "@/lib/workspace-context";

import { orpc } from "@/lib/orpc";

// ─────────────────────────────────────────────────────────────────────────────
// SessionConfigPopup
// Shows available MCP servers with toggles for a new session.
// Default-mode MCPs start ON, optional-mode MCPs start OFF.
// ─────────────────────────────────────────────────────────────────────────────

export function SessionConfigPopup({
  slug,
  onCreateSession,
}: {
  slug?: string;
  onCreateSession: (config: SessionMcpConfig) => void;
}) {
  const { data, isLoading } = useQuery(
    orpc.mcpServers.getPreferences.queryOptions({
      input: { slug },
    })
  );

  const servers = data?.servers ?? [];

  // Filter out the system explorer MCP
  const configurableServers = servers.filter(
    (s) =>
      s.name !== (process.env.NEXT_PUBLIC_INSTANCE_NAME ?? "claude-explorer")
  );

  // Track overrides: key = "scope:name", value = toggled state
  // undefined means use default (default MCPs on, optional MCPs off)
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());

  function getEffectiveState(server: {
    name: string;
    scope: string;
    mode: string;
  }): boolean {
    const key = `${server.scope}:${server.name}`;
    const override = overrides.get(key);
    if (override !== undefined) return override;
    return server.mode === "default";
  }

  function toggleServer(server: { name: string; scope: string; mode: string }) {
    const key = `${server.scope}:${server.name}`;
    setOverrides((prev) => {
      const next = new Map(prev);
      const current = getEffectiveState(server);
      next.set(key, !current);
      return next;
    });
  }

  function handleCreate() {
    const enabledOptionalMcps: McpSelection[] = [];
    const disabledDefaultMcps: McpSelection[] = [];

    for (const server of configurableServers) {
      const isOn = getEffectiveState(server);
      const scope = server.scope as "user" | "project" | "local";

      if (server.mode === "optional" && isOn) {
        enabledOptionalMcps.push({ name: server.name, scope });
      } else if (server.mode === "default" && !isOn) {
        disabledDefaultMcps.push({ name: server.name, scope });
      }
    }

    onCreateSession({ enabledOptionalMcps, disabledDefaultMcps });
  }

  // Check if any overrides have been made
  const hasOverrides = overrides.size > 0;

  // Group by scope
  const byScope = new Map<string, typeof configurableServers>();
  for (const s of configurableServers) {
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
    <div className="w-72">
      <div className="border-b border-border/50 px-3 py-2">
        <p className="text-xs font-medium text-foreground">
          Configure Session MCPs
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Choose which MCP servers to enable
        </p>
      </div>

      {isLoading ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          Loading...
        </div>
      ) : configurableServers.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          No MCP servers configured
        </div>
      ) : (
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
                  const checked = getEffectiveState(server);
                  return (
                    <button
                      key={`${server.scope}:${server.name}`}
                      type="button"
                      onClick={() => toggleServer(server)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
                    >
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
      )}

      <div className="border-t border-border/50 p-2">
        <button
          type="button"
          onClick={handleCreate}
          className={[
            "w-full rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            hasOverrides
              ? "bg-purple-500 text-white hover:bg-purple-600"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          ].join(" ")}
        >
          {hasOverrides ? "Create with Custom MCPs" : "Create Session"}
        </button>
      </div>
    </div>
  );
}
