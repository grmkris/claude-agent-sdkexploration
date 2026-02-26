"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { cn } from "@/lib/utils";

type McpTool = { name: string; description?: string };
type McpResult = { tools: McpTool[]; error?: string };
type McpScope = "user" | "local" | "project";

// ─────────────────────────────────────────────────────────────────────────────
// Add MCP inline form
// ─────────────────────────────────────────────────────────────────────────────

function AddMcpForm({ slug, onDone }: { slug: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "http" | "sse">("stdio");
  const [command, setCommand] = useState("");
  const [url, setUrl] = useState("");

  const add = useMutation({
    mutationFn: () =>
      client.mcpServers.add({
        name,
        scope: "local",
        transport,
        ...(transport === "stdio" ? { command, args: [] } : { url }),
        slug,
      }),
    onSuccess: async (result) => {
      if (!result.success) return;
      await queryClient.invalidateQueries({
        queryKey: orpc.projects.config.queryOptions({ input: { slug } })
          .queryKey,
      });
      onDone();
    },
  });

  return (
    <div className="flex flex-col gap-1.5 rounded border bg-background p-2 text-xs">
      <Input
        placeholder="Server name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-6 text-xs"
      />

      {/* Transport selector */}
      <div className="flex gap-1">
        {(["stdio", "http", "sse"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTransport(t)}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] transition-colors",
              transport === t
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {transport === "stdio" ? (
        <Input
          placeholder="command (e.g. npx my-mcp-server)"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          className="h-6 text-xs"
        />
      ) : (
        <Input
          placeholder="URL (e.g. https://mcp.example.com)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="h-6 text-xs"
        />
      )}

      {add.isError && (
        <p className="text-[10px] text-destructive">
          {(add.error as Error).message}
        </p>
      )}
      {add.data && !add.data.success && (
        <p className="text-[10px] text-destructive">{add.data.error}</p>
      )}

      <div className="flex gap-1">
        <Button
          size="sm"
          className="h-6 flex-1 text-xs"
          disabled={
            !name || (transport === "stdio" ? !command : !url) || add.isPending
          }
          onClick={() => add.mutate()}
        >
          {add.isPending ? "Adding…" : "Add"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs"
          onClick={onDone}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Command inline form
// ─────────────────────────────────────────────────────────────────────────────

function AddCommandForm({
  slug,
  onDone,
}: {
  slug: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const add = useMutation({
    mutationFn: () =>
      client.skills.addCommand({
        name,
        content: `---\ndescription: ${description}\n---\n\n${description}`,
        scope: "project",
        slug,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.projects.config.queryOptions({ input: { slug } })
          .queryKey,
      });
      onDone();
    },
  });

  return (
    <div className="flex flex-col gap-1.5 rounded border bg-background p-2 text-xs">
      <Input
        placeholder="Command name (e.g. review)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-6 text-xs"
      />
      <textarea
        placeholder="Description / content"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="rounded border bg-background px-2 py-1 text-xs placeholder:text-muted-foreground focus:outline-none"
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          className="h-6 flex-1 text-xs"
          disabled={!name || add.isPending}
          onClick={() => add.mutate()}
        >
          {add.isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs"
          onClick={onDone}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Environment variables editor
// ─────────────────────────────────────────────────────────────────────────────

function EnvVarsSection({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const { data: projectConfig } = useQuery({
    ...orpc.projects.config.queryOptions({ input: { slug } }),
    enabled: !!slug,
  });

  const [localEnv, setLocalEnv] = useState<Record<string, string> | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  // Initialise localEnv once data arrives (and reset when slug changes)
  const env = localEnv ?? projectConfig?.env ?? {};

  const save = useMutation({
    mutationFn: (updated: Record<string, string>) =>
      client.projects.setEnv({ slug, env: updated }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.projects.config.queryOptions({ input: { slug } })
          .queryKey,
      });
    },
  });

  const updateVar = (key: string, value: string) => {
    const updated = { ...env, [key]: value };
    setLocalEnv(updated);
    save.mutate(updated);
  };

  const removeVar = (key: string) => {
    const updated = { ...env };
    delete updated[key];
    setLocalEnv(updated);
    save.mutate(updated);
  };

  const addVar = () => {
    if (!newKey.trim()) return;
    const updated = { ...env, [newKey.trim()]: newVal };
    setLocalEnv(updated);
    setNewKey("");
    setNewVal("");
    save.mutate(updated);
  };

  return (
    <Collapsible defaultOpen={false}>
      <SidebarGroup className="py-1">
        <CollapsibleTrigger className="flex h-8 w-full cursor-pointer select-none items-center px-2 text-left text-xs font-medium text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground">
          Environment Variables ({Object.keys(env).length})
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <div className="flex flex-col gap-1 px-2 pb-1">
              {Object.entries(env).map(([key, value]) => (
                <div key={key} className="flex items-center gap-1">
                  <span className="w-24 shrink-0 truncate font-mono text-[10px] text-muted-foreground">
                    {key}
                  </span>
                  <Input
                    value={value}
                    onChange={(e) => updateVar(key, e.target.value)}
                    className="h-5 flex-1 font-mono text-[10px]"
                  />
                  <button
                    onClick={() => removeVar(key)}
                    title="Remove variable"
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3 w-3"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}

              {/* Add new variable row */}
              <div className="flex items-center gap-1 pt-1">
                <Input
                  placeholder="KEY"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addVar()}
                  className="h-5 w-20 shrink-0 font-mono text-[10px]"
                />
                <Input
                  placeholder="value"
                  value={newVal}
                  onChange={(e) => setNewVal(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addVar()}
                  className="h-5 flex-1 font-mono text-[10px]"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 shrink-0 px-1.5 text-[10px]"
                  disabled={!newKey.trim()}
                  onClick={addVar}
                >
                  +
                </Button>
              </div>
            </div>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function SkillsMcpsTab({ slug }: { slug: string | null }) {
  const queryClient = useQueryClient();

  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [skillContents, setSkillContents] = useState<Record<string, string>>(
    {}
  );
  const [loadingSkill, setLoadingSkill] = useState<string | null>(null);

  const [expandedMcp, setExpandedMcp] = useState<string | null>(null);
  const [mcpResults, setMcpResults] = useState<Record<string, McpResult>>({});
  const [loadingMcp, setLoadingMcp] = useState<string | null>(null);
  const [dismissedMcpErrors, setDismissedMcpErrors] = useState<Set<string>>(
    new Set()
  );

  const [showAddMcp, setShowAddMcp] = useState(false);
  const [showAddCommand, setShowAddCommand] = useState(false);

  const { data: userConfig, isLoading: userLoading } = useQuery(
    orpc.user.config.queryOptions()
  );

  const { data: projectConfig, isLoading: projectLoading } = useQuery({
    ...orpc.projects.config.queryOptions({ input: { slug: slug ?? "" } }),
    enabled: !!slug,
  });

  const isLoading = userLoading || (!!slug && projectLoading);

  const allSkills = [
    ...(userConfig?.skills ?? []),
    ...(projectConfig?.skills ?? []).filter((s) => s.scope === "project"),
  ];

  const mcpGroups: { label: string; scope: McpScope; servers: string[] }[] = [
    {
      label: "User MCPs",
      scope: "user" as const,
      servers: Object.keys(userConfig?.mcpServers ?? {}),
    },
    {
      label: "Project MCPs",
      scope: "project" as const,
      servers: Object.keys(projectConfig?.mcpServers ?? {}),
    },
    {
      label: "Local MCPs",
      scope: "local" as const,
      servers: Object.keys(projectConfig?.localMcpServers ?? {}),
    },
  ].filter((g) => g.servers.length > 0);

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

  const removeCommand = useMutation({
    mutationFn: (name: string) =>
      client.skills.removeCommand({
        name,
        scope: "project",
        ...(slug ? { slug } : {}),
      }),
    onSuccess: async () => {
      if (!slug) return;
      await queryClient.invalidateQueries({
        queryKey: orpc.projects.config.queryOptions({ input: { slug } })
          .queryKey,
      });
    },
  });

  const handleSkillToggle = async (
    skillName: string,
    skillType: "skill" | "command",
    skillScope: "user" | "project"
  ) => {
    if (expandedSkill === skillName) {
      setExpandedSkill(null);
      return;
    }
    setExpandedSkill(skillName);
    if (skillContents[skillName] !== undefined) return;
    setLoadingSkill(skillName);
    try {
      const result = await client.skills.getContent({
        name: skillName,
        type: skillType,
        scope: skillScope,
        ...(slug ? { slug } : {}),
      });
      setSkillContents((prev) => ({
        ...prev,
        [skillName]: result.content ?? "(no content)",
      }));
    } catch {
      setSkillContents((prev) => ({
        ...prev,
        [skillName]: "(failed to load)",
      }));
    } finally {
      setLoadingSkill(null);
    }
  };

  const handleMcpToggle = async (name: string, scope: McpScope) => {
    const key = `${scope}:${name}`;
    if (expandedMcp === key) {
      setExpandedMcp(null);
      return;
    }
    setDismissedMcpErrors((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setExpandedMcp(key);
    if (mcpResults[key] !== undefined) return;
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

  if (isLoading) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {Array.from({ length: 5 }).map((_, i) => (
              <SidebarMenuItem key={i}>
                <SidebarMenuSkeleton />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <div className="flex flex-col">
      {/* ── Skills / Commands ─────────────────────────────────────────── */}
      <Collapsible defaultOpen>
        <SidebarGroup className="pb-1">
          <div className="flex items-center">
            <CollapsibleTrigger className="flex h-8 flex-1 cursor-pointer select-none items-center px-2 text-left text-xs font-medium text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground">
              Skills ({allSkills.length})
            </CollapsibleTrigger>
            {slug && (
              <button
                onClick={() => setShowAddCommand((v) => !v)}
                title="Add project command"
                className="mr-2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            )}
          </div>
          <CollapsibleContent>
            <SidebarGroupContent>
              {showAddCommand && slug && (
                <div className="px-2 pb-1">
                  <AddCommandForm
                    slug={slug}
                    onDone={() => setShowAddCommand(false)}
                  />
                </div>
              )}
              {allSkills.length === 0 && !showAddCommand ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  No skills installed
                </p>
              ) : (
                <SidebarMenu>
                  {allSkills.map((skill) => (
                    <SidebarMenuItem key={`${skill.scope}-${skill.name}`}>
                      <SidebarMenuButton
                        onClick={() =>
                          handleSkillToggle(skill.name, skill.type, skill.scope)
                        }
                        isActive={expandedSkill === skill.name}
                      >
                        <span className="truncate">{skill.name}</span>
                        <span className="ml-auto shrink-0 text-muted-foreground">
                          {skill.scope}
                        </span>
                        {/* Remove button for project-scoped commands */}
                        {skill.scope === "project" && slug && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeCommand.mutate(skill.name);
                            }}
                            title="Remove command"
                            className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3 w-3"
                            >
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </SidebarMenuButton>
                      {expandedSkill === skill.name && (
                        <div className="border-t border-sidebar-border">
                          {loadingSkill === skill.name ? (
                            <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                              Loading…
                            </p>
                          ) : (
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words bg-muted/20 p-2 text-[11px] leading-relaxed text-muted-foreground">
                              {skillContents[skill.name]}
                            </pre>
                          )}
                        </div>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>

      {/* ── MCP Groups ────────────────────────────────────────────────── */}
      <Collapsible defaultOpen>
        <SidebarGroup className="py-1">
          <div className="flex items-center">
            <CollapsibleTrigger className="flex h-8 flex-1 cursor-pointer select-none items-center px-2 text-left text-xs font-medium text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground">
              MCP Servers
            </CollapsibleTrigger>
            {slug && (
              <button
                onClick={() => setShowAddMcp((v) => !v)}
                title="Add MCP server"
                className="mr-2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            )}
          </div>
          <CollapsibleContent>
            <SidebarGroupContent>
              {showAddMcp && slug && (
                <div className="px-2 pb-1">
                  <AddMcpForm slug={slug} onDone={() => setShowAddMcp(false)} />
                </div>
              )}

              {mcpGroups.length === 0 && !showAddMcp && (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  No MCP servers configured
                </p>
              )}

              {mcpGroups.map((group) => (
                <Collapsible key={group.label} defaultOpen>
                  <div className="px-2 pt-1">
                    <CollapsibleTrigger className="flex h-6 w-full cursor-pointer select-none items-center text-left text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
                      {group.label} ({group.servers.length})
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent>
                    <SidebarMenu>
                      {group.servers.map((name) => {
                        const key = `${group.scope}:${name}`;
                        const result = mcpResults[key];
                        const isExpanded = expandedMcp === key;
                        const isConnecting = loadingMcp === key;

                        return (
                          <SidebarMenuItem key={name}>
                            <SidebarMenuButton
                              onClick={() => handleMcpToggle(name, group.scope)}
                              isActive={isExpanded}
                            >
                              <span className="truncate">{name}</span>
                              {result && !isConnecting && (
                                <span
                                  className={cn(
                                    "ml-auto shrink-0 text-[10px]",
                                    result.error
                                      ? "text-red-400"
                                      : "text-green-400"
                                  )}
                                >
                                  {result.error
                                    ? "✗ error"
                                    : `✓ ${result.tools.length} tools`}
                                </span>
                              )}
                              {isConnecting && (
                                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                                  connecting…
                                </span>
                              )}
                              {/* Remove button for local/project-scoped MCPs */}
                              {(group.scope === "local" ||
                                group.scope === "project") &&
                                slug && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeMcp.mutate({
                                        name,
                                        scope: group.scope,
                                      });
                                    }}
                                    title="Remove MCP server"
                                    className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth={2}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="h-3 w-3"
                                    >
                                      <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                  </button>
                                )}
                            </SidebarMenuButton>

                            {isExpanded && (
                              <div className="border-t border-sidebar-border">
                                {isConnecting ? (
                                  <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                                    Connecting to MCP server…
                                  </p>
                                ) : result?.error &&
                                  !dismissedMcpErrors.has(key) ? (
                                  <div className="flex items-start gap-1 px-2 py-1.5">
                                    <p className="flex-1 text-[11px] text-red-400 overflow-auto max-h-24">
                                      {result.error}
                                    </p>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDismissedMcpErrors(
                                          (prev) => new Set([...prev, key])
                                        );
                                        setExpandedMcp(null);
                                      }}
                                      title="Dismiss error"
                                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                    >
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="h-3 w-3"
                                      >
                                        <path d="M18 6 6 18M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                ) : result?.tools.length === 0 ? (
                                  <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                                    No tools exposed
                                  </p>
                                ) : (
                                  <div className="py-1">
                                    {result?.tools.map((tool) => (
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
                      })}
                    </SidebarMenu>
                  </CollapsibleContent>
                </Collapsible>
              ))}

              {/* Browse catalog link */}
              <div className="px-2 pb-1 pt-2">
                <Link
                  href="/mcps"
                  className="text-[10px] text-muted-foreground hover:text-foreground hover:underline transition-colors"
                >
                  Browse MCP catalog →
                </Link>
              </div>
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>

      {/* ── Environment Variables ────────────────────────────────────── */}
      {slug && <EnvVarsSection slug={slug} />}
    </div>
  );
}
