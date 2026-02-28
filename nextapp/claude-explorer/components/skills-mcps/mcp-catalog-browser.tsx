"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  MCP_CATALOG,
  MCP_CATEGORIES,
  type McpCatalogEntry,
  type McpCategory,
} from "@/lib/mcp-catalog";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";

type McpScope = "user" | "local" | "project";

export function McpCatalogBrowser({
  slug,
  defaultScope,
  showScopeSelector = false,
  showProjectSelector = false,
}: {
  slug?: string;
  defaultScope?: McpScope;
  showScopeSelector?: boolean;
  showProjectSelector?: boolean;
}) {
  const queryClient = useQueryClient();
  const resolvedDefault = defaultScope ?? (slug ? "local" : "user");

  const { data: userConfig } = useQuery({
    ...orpc.user.config.queryOptions(),
    refetchInterval: 30000,
  });
  const { data: projectConfig } = useQuery({
    ...orpc.projects.config.queryOptions({ input: { slug: slug ?? "" } }),
    enabled: !!slug,
  });
  const { data: projects } = useQuery({
    ...orpc.projects.list.queryOptions(),
    enabled: showProjectSelector,
  });

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<McpCategory | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scope, setScope] = useState<McpScope>(resolvedDefault);
  const [selectedSlug, setSelectedSlug] = useState(slug ?? "");
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [justInstalled, setJustInstalled] = useState<string | null>(null);

  const effectiveSlug = slug ?? selectedSlug;

  // Build comprehensive installed set across all scopes
  const installedNames = new Set([
    ...Object.keys((userConfig?.mcpServers ?? {}) as Record<string, unknown>),
    ...Object.keys(
      (projectConfig?.mcpServers ?? {}) as Record<string, unknown>
    ),
    ...Object.keys(
      (projectConfig?.localMcpServers ?? {}) as Record<string, unknown>
    ),
  ]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: orpc.user.config.queryOptions().queryKey,
      }),
      ...(effectiveSlug
        ? [
            queryClient.invalidateQueries({
              queryKey: orpc.projects.config.queryOptions({
                input: { slug: effectiveSlug },
              }).queryKey,
            }),
          ]
        : []),
    ]);
  };

  const installMcp = useMutation({
    mutationFn: (entry: McpCatalogEntry) => {
      const env =
        entry.envTemplate && Object.keys(envValues).length > 0
          ? Object.fromEntries(
              Object.entries(envValues).filter(([, v]) => v.length > 0)
            )
          : undefined;

      // For http/sse servers with headersTemplate, interpolate env values into headers
      let headers: Record<string, string> | undefined;
      if (entry.headersTemplate && Object.keys(envValues).length > 0) {
        headers = {};
        for (const [key, tmpl] of Object.entries(entry.headersTemplate)) {
          headers[key] = tmpl.replace(
            /\{\{(\w+)\}\}/g,
            (_, varName) => envValues[varName] ?? ""
          );
        }
      }

      // For http/sse servers with headersTemplate, pass headers instead of env
      // (env values were only needed to construct the headers)
      const useHeaders = entry.transport !== "stdio" && headers;

      return client.mcpServers.add({
        name: entry.id,
        scope,
        transport: entry.transport,
        ...(entry.transport === "stdio"
          ? { command: entry.command, args: entry.args }
          : {}),
        ...(entry.transport !== "stdio" ? { url: entry.url } : {}),
        ...(!useHeaders && env && Object.keys(env).length > 0 ? { env } : {}),
        ...(useHeaders ? { headers } : {}),
        ...(scope !== "user" && effectiveSlug ? { slug: effectiveSlug } : {}),
      });
    },
    onSuccess: async (result, entry) => {
      if (result.success) {
        await invalidate();
        setJustInstalled(entry.id);
        setTimeout(() => {
          setJustInstalled(null);
          setExpandedId(null);
        }, 1500);
        setEnvValues({});
      }
    },
  });

  const filtered = MCP_CATALOG.filter((entry) => {
    const matchSearch =
      !search ||
      entry.name.toLowerCase().includes(search.toLowerCase()) ||
      entry.description.toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === "all" || entry.category === category;
    return matchSearch && matchCategory;
  });

  const handleExpand = (entry: McpCatalogEntry) => {
    if (expandedId === entry.id) {
      setExpandedId(null);
      setEnvValues({});
      return;
    }
    setExpandedId(entry.id);
    setScope(resolvedDefault);
    setSelectedSlug(slug ?? "");
    if (entry.envTemplate) {
      setEnvValues({ ...entry.envTemplate });
    } else {
      setEnvValues({});
    }
  };

  const handleQuickInstall = (entry: McpCatalogEntry) => {
    setScope(resolvedDefault);
    setSelectedSlug(slug ?? "");
    setEnvValues({});
    installMcp.mutate(entry);
  };

  const hasRequiredEnv = (entry: McpCatalogEntry) =>
    entry.envTemplate && Object.keys(entry.envTemplate).length > 0;

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="Search MCPs..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-64"
      />

      <div className="flex gap-1 flex-wrap">
        {MCP_CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setCategory(cat.value)}
            className={`px-2 py-0.5 text-[11px] border transition-colors ${
              category === cat.value
                ? "bg-foreground text-background border-foreground"
                : "bg-transparent text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {filtered.map((entry) => {
          const isInstalled = installedNames.has(entry.id);
          const isExpanded = expandedId === entry.id;
          const isInstalling =
            installMcp.isPending && installMcp.variables?.id === entry.id;
          const wasJustInstalled = justInstalled === entry.id;

          return (
            <div key={entry.id} className="flex flex-col">
              <Card
                size="sm"
                className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                  isExpanded ? "ring-1 ring-foreground/20" : ""
                } ${wasJustInstalled ? "ring-1 ring-green-400/50" : ""}`}
                onClick={() =>
                  !isInstalled && !wasJustInstalled && handleExpand(entry)
                }
              >
                <CardContent className="flex flex-col gap-1.5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{entry.emoji}</span>
                    <span className="text-sm font-medium">{entry.name}</span>
                    <div className="flex-1" />
                    {(isInstalled || wasJustInstalled) && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-[10px]"
                      >
                        {wasJustInstalled ? "\u2713 Installed!" : "Installed"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {entry.description}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      {entry.transport}
                    </Badge>
                    {entry.transport === "stdio" && entry.command && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {entry.command}
                      </span>
                    )}
                    {!isInstalled && !isExpanded && !wasJustInstalled && (
                      <div className="ml-auto flex gap-1">
                        {!hasRequiredEnv(entry) && (
                          <Button
                            size="xs"
                            className="h-5 px-2 text-[10px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickInstall(entry);
                            }}
                            disabled={isInstalling}
                          >
                            {isInstalling ? "Installing..." : "Quick Install"}
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="outline"
                          className="h-5 px-2 text-[10px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExpand(entry);
                          }}
                        >
                          {hasRequiredEnv(entry) ? "Install" : "Configure"}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {isExpanded && (
                <Card size="sm" className="border-t-0">
                  <CardContent className="flex flex-col gap-2 py-3">
                    {/* Scope selector */}
                    <div className="flex gap-2 items-center flex-wrap">
                      <label className="text-[10px] text-muted-foreground">
                        Scope
                      </label>
                      {showScopeSelector ? (
                        <select
                          value={scope}
                          onChange={(e) => setScope(e.target.value as McpScope)}
                          className="rounded border bg-background px-2 py-0.5 text-xs"
                        >
                          <option value="user">User</option>
                          <option value="local">Local</option>
                          <option value="project">Project</option>
                        </select>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          {scope}
                        </Badge>
                      )}
                      {showProjectSelector && scope !== "user" && !slug && (
                        <select
                          value={selectedSlug}
                          onChange={(e) => setSelectedSlug(e.target.value)}
                          className="rounded border bg-background px-2 py-0.5 text-xs"
                        >
                          <option value="">Select project...</option>
                          {projects?.map((p) => (
                            <option key={p.slug} value={p.slug}>
                              {p.path.split("/").slice(-2).join("/")}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Env vars */}
                    {entry.envTemplate &&
                      Object.keys(entry.envTemplate).length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] text-muted-foreground">
                            Environment Variables
                          </label>
                          {Object.keys(entry.envTemplate).map((key) => (
                            <div key={key} className="flex gap-2 items-center">
                              <span className="text-[10px] font-mono text-muted-foreground w-48 shrink-0">
                                {key}
                              </span>
                              <Input
                                placeholder={`Enter ${key}`}
                                value={envValues[key] ?? ""}
                                onChange={(e) =>
                                  setEnvValues((prev) => ({
                                    ...prev,
                                    [key]: e.target.value,
                                  }))
                                }
                                className="h-6 text-xs"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                    {entry.authNote && (
                      <p className="text-[10px] text-muted-foreground italic">
                        {entry.authNote}
                      </p>
                    )}

                    <div className="flex gap-2 items-center">
                      <Button
                        size="xs"
                        className="h-6 px-3 text-[11px]"
                        disabled={
                          isInstalling ||
                          (showScopeSelector &&
                            scope !== "user" &&
                            !effectiveSlug)
                        }
                        onClick={() => installMcp.mutate(entry)}
                      >
                        {isInstalling ? "Installing..." : "Install"}
                      </Button>
                      {entry.docsUrl && (
                        <a
                          href={entry.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-muted-foreground hover:text-foreground underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Docs
                        </a>
                      )}
                      <button
                        onClick={() => {
                          setExpandedId(null);
                          setEnvValues({});
                        }}
                        className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>

                    {installMcp.data &&
                      !installMcp.data.success &&
                      expandedId === entry.id && (
                        <p className="text-xs text-red-400">
                          {installMcp.data.error}
                        </p>
                      )}
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No MCPs match your search.
        </p>
      )}
    </div>
  );
}
