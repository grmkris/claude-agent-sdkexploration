"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import {
  McpServerCard,
  type McpToolResult,
} from "@/components/skills-mcps/mcp-server-card";
import { ScopeExplainer } from "@/components/skills-mcps/scope-explainer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { cn } from "@/lib/utils";

type McpScope = "user" | "local" | "project";

interface ServerEntry {
  name: string;
  scope: McpScope;
  config: Record<string, unknown>;
}

export function McpServerList({
  slug,
  userServers = {},
  projectServers,
  localServers = {},
  compact = false,
  showUserServers = true,
  showScopeExplainer = true,
}: {
  slug?: string;
  userServers?: Record<string, unknown>;
  projectServers?: Record<string, unknown> | null;
  localServers?: Record<string, unknown>;
  compact?: boolean;
  showUserServers?: boolean;
  showScopeExplainer?: boolean;
}) {
  const queryClient = useQueryClient();
  const [mcpResults, setMcpResults] = useState<Record<string, McpToolResult>>(
    {}
  );
  const [loadingMcp, setLoadingMcp] = useState<string | null>(null);

  const instanceName =
    typeof window !== "undefined"
      ? (window as unknown as Record<string, unknown>).__INSTANCE_NAME
      : undefined;
  const systemName =
    (instanceName as string) ??
    process.env.NEXT_PUBLIC_INSTANCE_NAME ??
    "claude-explorer";

  const removeMcp = useMutation({
    mutationFn: ({ name, scope }: { name: string; scope: McpScope }) =>
      client.mcpServers.remove({ name, scope, ...(slug ? { slug } : {}) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.user.config.queryOptions().queryKey,
        }),
        ...(slug
          ? [
              queryClient.invalidateQueries({
                queryKey: orpc.projects.config.queryOptions({
                  input: { slug },
                }).queryKey,
              }),
            ]
          : []),
      ]);
    },
  });

  const handleInspect = async (name: string, scope: McpScope) => {
    const key = `${scope}:${name}`;
    if (mcpResults[key]) return; // Already inspected
    setLoadingMcp(key);
    try {
      const result = await client.mcpServers.inspectTools({
        name,
        scope,
        ...(slug ? { slug } : {}),
      });
      setMcpResults((prev) => ({ ...prev, [key]: result }));
    } catch (e) {
      setMcpResults((prev) => ({
        ...prev,
        [key]: {
          tools: [],
          error: e instanceof Error ? e.message : "Inspection failed",
        },
      }));
    } finally {
      setLoadingMcp(null);
    }
  };

  const handleCheckAll = async () => {
    const allServers: ServerEntry[] = [
      ...Object.entries(localServers).map(([n, cfg]) => ({
        name: n,
        scope: "local" as const,
        config: cfg as Record<string, unknown>,
      })),
      ...Object.entries(projectServers ?? {}).map(([n, cfg]) => ({
        name: n,
        scope: "project" as const,
        config: cfg as Record<string, unknown>,
      })),
      ...(showUserServers
        ? Object.entries(userServers).map(([n, cfg]) => ({
            name: n,
            scope: "user" as const,
            config: cfg as Record<string, unknown>,
          }))
        : []),
    ];

    // Fire all inspections in parallel
    await Promise.allSettled(
      allServers.map(async (s) => {
        const key = `${s.scope}:${s.name}`;
        if (mcpResults[key]) return;
        setLoadingMcp(key);
        try {
          const result = await client.mcpServers.inspectTools({
            name: s.name,
            scope: s.scope,
            ...(slug ? { slug } : {}),
          });
          setMcpResults((prev) => ({ ...prev, [key]: result }));
        } catch (e) {
          setMcpResults((prev) => ({
            ...prev,
            [key]: {
              tools: [],
              error: e instanceof Error ? e.message : "Inspection failed",
            },
          }));
        }
      })
    );
    setLoadingMcp(null);
  };

  // Build scope groups ordered: Local -> Project -> User (inherited)
  const groups: {
    label: string;
    scope: McpScope;
    servers: ServerEntry[];
    inherited?: boolean;
  }[] = [];

  const localEntries = Object.entries(localServers).map(([n, cfg]) => ({
    name: n,
    scope: "local" as const,
    config: cfg as Record<string, unknown>,
  }));
  if (localEntries.length > 0) {
    groups.push({ label: "Local", scope: "local", servers: localEntries });
  }

  const projectEntries = Object.entries(projectServers ?? {}).map(
    ([n, cfg]) => ({
      name: n,
      scope: "project" as const,
      config: cfg as Record<string, unknown>,
    })
  );
  if (projectEntries.length > 0) {
    groups.push({
      label: "Project",
      scope: "project",
      servers: projectEntries,
    });
  }

  if (showUserServers) {
    const userEntries = Object.entries(userServers).map(([n, cfg]) => ({
      name: n,
      scope: "user" as const,
      config: cfg as Record<string, unknown>,
    }));
    if (userEntries.length > 0) {
      groups.push({
        label: "Inherited from User",
        scope: "user",
        servers: userEntries,
        inherited: true,
      });
    }
  }

  const totalCount = groups.reduce((acc, g) => acc + g.servers.length, 0);

  if (compact) {
    // Sidebar compact: flat list with scope dots
    const allServers = groups.flatMap((g) => g.servers);
    return (
      <SidebarGroup className="py-1">
        <SidebarGroupContent>
          <SidebarMenu>
            {allServers.map((s) => {
              const key = `${s.scope}:${s.name}`;
              return (
                <McpServerCard
                  key={key}
                  name={s.name}
                  scope={s.scope}
                  config={s.config}
                  slug={slug}
                  isSystem={s.name === systemName}
                  toolResult={mcpResults[key] ?? null}
                  isInspecting={loadingMcp === key}
                  onInspect={() => handleInspect(s.name, s.scope)}
                  onRemove={() =>
                    removeMcp.mutate({ name: s.name, scope: s.scope })
                  }
                  compact
                />
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  // Full-size list with scope grouping
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">
          MCP Servers ({totalCount})
        </h3>
        <div className="flex items-center gap-2">
          {showScopeExplainer && <ScopeExplainer />}
          {totalCount > 0 && (
            <button
              onClick={handleCheckAll}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Check all
            </button>
          )}
        </div>
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No MCP servers configured.
        </p>
      )}

      {groups.map((group) => (
        <Collapsible key={group.label} defaultOpen>
          <CollapsibleTrigger
            className={cn(
              "flex h-7 w-full cursor-pointer select-none items-center text-left text-[11px] font-medium uppercase tracking-wider transition-colors hover:text-foreground",
              group.inherited
                ? "text-muted-foreground/50"
                : "text-muted-foreground"
            )}
          >
            {group.label} ({group.servers.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-col gap-1.5">
              {group.servers.map((s) => {
                const key = `${s.scope}:${s.name}`;
                return (
                  <McpServerCard
                    key={key}
                    name={s.name}
                    scope={s.scope}
                    config={s.config}
                    slug={slug}
                    isSystem={s.name === systemName}
                    toolResult={mcpResults[key] ?? null}
                    isInspecting={loadingMcp === key}
                    onInspect={() => handleInspect(s.name, s.scope)}
                    onRemove={() =>
                      removeMcp.mutate({ name: s.name, scope: s.scope })
                    }
                  />
                );
              })}
            </div>
            {group.inherited && (
              <p className="mt-1 text-[10px] text-muted-foreground/60">
                Manage user-level MCPs at{" "}
                <Link
                  href="/mcps"
                  className="underline hover:text-foreground transition-colors"
                >
                  Settings &rarr; MCPs
                </Link>
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}
