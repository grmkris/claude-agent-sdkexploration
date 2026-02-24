"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { McpCatalogView } from "@/components/mcp-catalog-view";
import { SkillCatalogView } from "@/components/skill-catalog-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";

// --- MCP Servers Section ---

function McpServersSection() {
  const queryClient = useQueryClient();
  const { data: userConfig } = useQuery({
    ...orpc.user.config.queryOptions(),
    refetchInterval: 30000,
  });
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());

  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "http" | "sse">("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [scope, setScope] = useState<"user" | "local" | "project">("user");
  const [slug, setSlug] = useState("");
  const [envText, setEnvText] = useState("");
  const [showEnv, setShowEnv] = useState(false);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const [toolResults, setToolResults] = useState<
    Record<
      string,
      {
        tools: Array<{
          name: string;
          description?: string;
          inputSchema?: unknown;
        }>;
        error?: string;
      }
    >
  >({});
  const [expandedSchema, setExpandedSchema] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: orpc.user.config.queryOptions().queryKey,
    });
    // Also invalidate project configs
    if (projects) {
      for (const p of projects) {
        void queryClient.invalidateQueries({
          queryKey: orpc.projects.config.queryOptions({
            input: { slug: p.slug },
          }).queryKey,
        });
      }
    }
  };

  const parseEnv = (text: string): Record<string, string> => {
    const env: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
      }
    }
    return env;
  };

  const addServer = useMutation({
    mutationFn: () => {
      const env = envText.trim() ? parseEnv(envText) : undefined;
      return client.mcpServers.add({
        name,
        scope,
        transport,
        ...(transport === "stdio"
          ? { command, args: args ? args.split(/[,\s]+/).filter(Boolean) : [] }
          : {}),
        ...(transport !== "stdio" ? { url } : {}),
        ...(env && Object.keys(env).length > 0 ? { env } : {}),
        ...(scope !== "user" && slug ? { slug } : {}),
      });
    },
    onSuccess: (result) => {
      if (result.success) {
        invalidate();
        setName("");
        setCommand("");
        setArgs("");
        setUrl("");
        setEnvText("");
        setShowEnv(false);
      }
    },
  });

  const removeServer = useMutation({
    mutationFn: (params: {
      name: string;
      scope: "user" | "local" | "project";
      slug?: string;
    }) => client.mcpServers.remove(params),
    onSuccess: invalidate,
  });

  const handleInspect = async (
    serverName: string,
    serverScope: "user" | "local" | "project",
    serverSlug?: string
  ) => {
    const key = `${serverScope}:${serverName}`;
    if (inspecting === key) {
      setInspecting(null);
      return;
    }
    setInspecting(key);
    try {
      const result = await client.mcpServers.inspectTools({
        name: serverName,
        scope: serverScope,
        ...(serverSlug ? { slug: serverSlug } : {}),
      });
      setToolResults((prev) => ({ ...prev, [key]: result }));
    } catch (e) {
      setToolResults((prev) => ({
        ...prev,
        [key]: { tools: [], error: e instanceof Error ? e.message : "Failed" },
      }));
    }
  };

  // Build MCP server list grouped by scope
  const userServers = Object.entries(
    (userConfig?.mcpServers ?? {}) as Record<string, Record<string, unknown>>
  ).map(([n, cfg]) => ({ name: n, scope: "user" as const, config: cfg }));

  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add MCP Server</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input
                placeholder="Server name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-48"
              />
              <select
                value={transport}
                onChange={(e) =>
                  setTransport(e.target.value as typeof transport)
                }
                className="rounded border bg-background px-2 text-sm"
              >
                <option value="stdio">stdio</option>
                <option value="http">http</option>
                <option value="sse">sse</option>
              </select>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as typeof scope)}
                className="rounded border bg-background px-2 text-sm"
              >
                <option value="user">User</option>
                <option value="local">Local</option>
                <option value="project">Project</option>
              </select>
              {scope !== "user" && (
                <select
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="rounded border bg-background px-2 text-sm"
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
            {transport === "stdio" ? (
              <div className="flex gap-2">
                <Input
                  placeholder="Command (e.g. npx, bun)"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className="w-48"
                />
                <Input
                  placeholder="Args (space or comma separated)"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  className="flex-1"
                />
              </div>
            ) : (
              <Input
                placeholder="URL (e.g. https://mcp.example.com/sse)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            )}
            <div>
              <button
                onClick={() => setShowEnv(!showEnv)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {showEnv ? "Hide env vars" : "+ Env vars (optional)"}
              </button>
              {showEnv && (
                <textarea
                  placeholder={"KEY=value\nANOTHER=value"}
                  value={envText}
                  onChange={(e) => setEnvText(e.target.value)}
                  className="mt-1 w-full min-h-[60px] rounded border bg-background px-3 py-2 text-sm font-mono"
                />
              )}
            </div>
            <Button
              size="sm"
              className="w-fit"
              disabled={
                !name ||
                (transport === "stdio" ? !command : !url) ||
                addServer.isPending
              }
              onClick={() => addServer.mutate()}
            >
              {addServer.isPending ? "Adding..." : "Add Server"}
            </Button>
            {addServer.data && !addServer.data.success && (
              <p className="text-xs text-red-400">{addServer.data.error}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Server list */}
      {userServers.length === 0 ? (
        <p className="mb-6 text-sm text-muted-foreground">
          No user-scoped MCP servers.
        </p>
      ) : (
        <div className="mb-6 flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            User MCP Servers
          </h3>
          {userServers.map((s) => {
            const key = `user:${s.name}`;
            const serverType = (s.config.type as string) ?? "stdio";
            const cmd = s.config.command as string | undefined;
            const sUrl = s.config.url as string | undefined;
            const isInspecting = inspecting === key;
            const tools = toolResults[key];

            return (
              <div key={s.name}>
                <Card size="sm">
                  <CardContent className="flex items-center gap-3 py-3">
                    <span className="shrink-0 text-sm font-medium">
                      {s.name}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {serverType}
                    </Badge>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      user
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground font-mono">
                      {cmd ?? sUrl ?? ""}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => handleInspect(s.name, "user")}
                    >
                      {isInspecting ? "Hide" : "Tools"}
                    </Button>
                    {s.name ===
                    (process.env.NEXT_PUBLIC_INSTANCE_NAME ??
                      "claude-explorer") ? (
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-[10px]"
                      >
                        System
                      </Badge>
                    ) : (
                      <button
                        onClick={() =>
                          removeServer.mutate({ name: s.name, scope: "user" })
                        }
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                        title="Remove"
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
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </CardContent>
                </Card>
                {isInspecting && tools && (
                  <ToolInspectionPanel
                    tools={tools.tools}
                    error={tools.error}
                    expandedSchema={expandedSchema}
                    onToggleSchema={setExpandedSchema}
                  />
                )}
                {isInspecting && !tools && (
                  <div className="ml-4 py-2 text-xs text-muted-foreground animate-pulse">
                    Connecting to server...
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// --- Tool Inspection Panel ---

function ToolInspectionPanel({
  tools,
  error,
  expandedSchema,
  onToggleSchema,
}: {
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  error?: string;
  expandedSchema: string | null;
  onToggleSchema: (name: string | null) => void;
}) {
  if (error) {
    return (
      <div className="ml-4 rounded border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
        {error}
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <div className="ml-4 py-2 text-xs text-muted-foreground">
        No tools found.
      </div>
    );
  }

  return (
    <div className="ml-4 rounded border bg-muted/20 px-3 py-2">
      <div className="mb-1 text-[10px] font-medium text-muted-foreground">
        {tools.length} tools
      </div>
      <div className="flex flex-col gap-1">
        {tools.map((t) => (
          <div key={t.name}>
            <div className="flex items-start gap-2">
              <button
                onClick={() =>
                  onToggleSchema(expandedSchema === t.name ? null : t.name)
                }
                className="font-mono text-xs text-foreground hover:underline"
              >
                {t.name}
              </button>
              {t.description && (
                <span className="text-[10px] text-muted-foreground">
                  {t.description}
                </span>
              )}
            </div>
            {expandedSchema === t.name && !!t.inputSchema && (
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/30 p-2 text-[10px] text-muted-foreground">
                {JSON.stringify(t.inputSchema, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Skills Section ---

function SkillsSection() {
  const queryClient = useQueryClient();
  const { data: userConfig } = useQuery({
    ...orpc.user.config.queryOptions(),
    refetchInterval: 30000,
  });

  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [viewingSkill, setViewingSkill] = useState<string | null>(null);
  const [viewContent, setViewContent] = useState<string | null>(null);

  const skills = userConfig?.skills.filter((s) => s.type === "skill") ?? [];

  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: orpc.user.config.queryOptions().queryKey,
    });

  const addSkill = useMutation({
    mutationFn: () => client.skills.add({ name, content }),
    onSuccess: () => {
      invalidate();
      setName("");
      setContent("");
    },
  });

  const removeSkill = useMutation({
    mutationFn: (skillName: string) =>
      client.skills.remove({ name: skillName }),
    onSuccess: invalidate,
  });

  const handleView = async (skillName: string) => {
    if (viewingSkill === skillName) {
      setViewingSkill(null);
      setViewContent(null);
      return;
    }
    setViewingSkill(skillName);
    const result = await client.skills.getContent({
      name: skillName,
      type: "skill",
      scope: "user",
    });
    setViewContent(result.content);
  };

  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add User Skill</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <Input
              placeholder="Skill name (directory name)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-64"
            />
            <textarea
              placeholder={
                "---\nname: my-skill\ndescription: Does something\n---\n\nSkill content here..."
              }
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[120px] rounded border bg-background px-3 py-2 text-sm font-mono"
            />
            <Button
              size="sm"
              className="w-fit"
              disabled={!name || !content || addSkill.isPending}
              onClick={() => addSkill.mutate()}
            >
              {addSkill.isPending ? "Saving..." : "Save Skill"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {skills.length === 0 ? (
        <p className="mb-6 text-sm text-muted-foreground">No user skills.</p>
      ) : (
        <div className="mb-6 flex flex-col gap-2">
          {skills.map((s) => (
            <div key={s.name}>
              <Card size="sm">
                <CardContent className="flex items-center gap-3 py-3">
                  <span className="shrink-0 text-sm font-medium">
                    /{s.name}
                  </span>
                  {s.description && (
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {s.description}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => handleView(s.name)}
                  >
                    {viewingSkill === s.name ? "Hide" : "View"}
                  </Button>
                  <button
                    onClick={() => removeSkill.mutate(s.name)}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                    title="Delete"
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
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </CardContent>
              </Card>
              {viewingSkill === s.name && viewContent !== null && (
                <pre className="ml-4 mt-1 max-h-48 overflow-auto rounded border bg-muted/20 p-2 text-[11px] text-muted-foreground">
                  {viewContent}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// --- Commands Section ---

function CommandsSection() {
  const queryClient = useQueryClient();
  const { data: userConfig } = useQuery({
    ...orpc.user.config.queryOptions(),
    refetchInterval: 30000,
  });

  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [viewingCmd, setViewingCmd] = useState<string | null>(null);
  const [viewContent, setViewContent] = useState<string | null>(null);

  const commands =
    userConfig?.skills.filter(
      (s) => s.type === "command" && s.scope === "user"
    ) ?? [];

  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: orpc.user.config.queryOptions().queryKey,
    });

  const addCommand = useMutation({
    mutationFn: () =>
      client.skills.addCommand({ name, content, scope: "user" }),
    onSuccess: () => {
      invalidate();
      setName("");
      setContent("");
    },
  });

  const removeCommand = useMutation({
    mutationFn: (cmdName: string) =>
      client.skills.removeCommand({ name: cmdName, scope: "user" }),
    onSuccess: invalidate,
  });

  const handleView = async (cmdName: string) => {
    if (viewingCmd === cmdName) {
      setViewingCmd(null);
      setViewContent(null);
      return;
    }
    setViewingCmd(cmdName);
    const result = await client.skills.getContent({
      name: cmdName,
      type: "command",
      scope: "user",
    });
    setViewContent(result.content);
  };

  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add User Command</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <Input
              placeholder="Command name (without .md)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-64"
            />
            <textarea
              placeholder="Command content (markdown)..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[100px] rounded border bg-background px-3 py-2 text-sm font-mono"
            />
            <Button
              size="sm"
              className="w-fit"
              disabled={!name || !content || addCommand.isPending}
              onClick={() => addCommand.mutate()}
            >
              {addCommand.isPending ? "Saving..." : "Save Command"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {commands.length === 0 ? (
        <p className="mb-6 text-sm text-muted-foreground">No user commands.</p>
      ) : (
        <div className="mb-6 flex flex-col gap-2">
          {commands.map((s) => (
            <div key={s.name}>
              <Card size="sm">
                <CardContent className="flex items-center gap-3 py-3">
                  <span className="shrink-0 text-sm font-medium">
                    /{s.name}
                  </span>
                  {s.description && (
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {s.description}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => handleView(s.name)}
                  >
                    {viewingCmd === s.name ? "Hide" : "View"}
                  </Button>
                  <button
                    onClick={() => removeCommand.mutate(s.name)}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                    title="Delete"
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
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </CardContent>
              </Card>
              {viewingCmd === s.name && viewContent !== null && (
                <pre className="ml-4 mt-1 max-h-48 overflow-auto rounded border bg-muted/20 p-2 text-[11px] text-muted-foreground">
                  {viewContent}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// --- Page ---

export default function McpsPage() {
  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-semibold">MCP Servers & Skills</h1>

      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        MCP Servers
      </h2>
      <Tabs defaultValue="catalog">
        <TabsList variant="line">
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog">
          <McpCatalogView />
        </TabsContent>
        <TabsContent value="custom">
          <McpServersSection />
        </TabsContent>
      </Tabs>

      <h2 className="mt-6 mb-3 text-sm font-medium text-muted-foreground">
        User Skills
      </h2>
      <Tabs defaultValue="skill-catalog">
        <TabsList variant="line">
          <TabsTrigger value="skill-catalog">Catalog</TabsTrigger>
          <TabsTrigger value="skill-custom">Custom</TabsTrigger>
        </TabsList>
        <TabsContent value="skill-catalog">
          <SkillCatalogView />
        </TabsContent>
        <TabsContent value="skill-custom">
          <SkillsSection />
        </TabsContent>
      </Tabs>

      <h2 className="mt-6 mb-3 text-sm font-medium text-muted-foreground">
        User Commands
      </h2>
      <CommandsSection />
    </div>
  );
}
