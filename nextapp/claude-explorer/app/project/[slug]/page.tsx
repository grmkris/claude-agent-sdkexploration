"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PatchDiff } from "@pierre/diffs/react";
import { use, useState, useCallback, useRef, useMemo } from "react";

import { CopyButton } from "@/components/copy-button";
import { ProjectIntegrations } from "@/components/project-integrations";
import { SessionList } from "@/components/session-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { cronToHuman, CRON_PRESETS } from "@/lib/cron-human";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import {
  generateTmuxCommand,
  generateAttachCommand,
  type TmuxLayout,
} from "@/lib/tmux-command";

// --- Helpers ---

function formatSize(bytes: number): string {
  if (bytes === 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function ChevronIcon({
  open,
  className,
}: {
  open: boolean;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""} ${className ?? ""}`}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

// --- Skills bar: MCPs, Agents, Crons, Webhooks, Tmux summary ---

function ProjectSkills({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const { data: config } = useQuery({
    ...orpc.projects.config.queryOptions({ input: { slug } }),
    enabled: expanded,
  });
  const { data: allCrons } = useQuery({
    ...orpc.crons.list.queryOptions(),
    refetchInterval: 30000,
    enabled: expanded,
  });
  const { data: allWebhooks } = useQuery({
    ...orpc.webhooks.list.queryOptions(),
    refetchInterval: 30000,
    enabled: expanded,
  });
  const { data: allPanes } = useQuery({
    ...orpc.tmux.panes.queryOptions(),
    refetchInterval: 30000,
    enabled: expanded,
  });

  // Inline add MCP form
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [mcpName, setMcpName] = useState("");
  const [mcpTransport, setMcpTransport] = useState<"stdio" | "http" | "sse">(
    "stdio"
  );
  const [mcpCommand, setMcpCommand] = useState("");
  const [mcpArgs, setMcpArgs] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");

  // Inline add command form
  const [showAddCmd, setShowAddCmd] = useState(false);
  const [cmdName, setCmdName] = useState("");
  const [cmdContent, setCmdContent] = useState("");

  // Tool inspection
  const [inspectingMcp, setInspectingMcp] = useState<string | null>(null);
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

  const invalidateConfig = () => {
    void queryClient.invalidateQueries({
      queryKey: orpc.projects.config.queryOptions({ input: { slug } }).queryKey,
    });
    void queryClient.invalidateQueries({
      queryKey: orpc.user.config.queryOptions().queryKey,
    });
  };

  const addMcpMutation = useMutation({
    mutationFn: () =>
      client.mcpServers.add({
        name: mcpName,
        scope: "project",
        transport: mcpTransport,
        slug,
        ...(mcpTransport === "stdio"
          ? {
              command: mcpCommand,
              args: mcpArgs ? mcpArgs.split(/[,\s]+/).filter(Boolean) : [],
            }
          : { url: mcpUrl }),
      }),
    onSuccess: (result) => {
      if (result.success) {
        invalidateConfig();
        setMcpName("");
        setMcpCommand("");
        setMcpArgs("");
        setMcpUrl("");
        setShowAddMcp(false);
      }
    },
  });

  const removeMcpMutation = useMutation({
    mutationFn: (params: {
      name: string;
      scope: "user" | "local" | "project";
    }) => client.mcpServers.remove({ ...params, slug }),
    onSuccess: invalidateConfig,
  });

  const addCmdMutation = useMutation({
    mutationFn: () =>
      client.skills.addCommand({
        name: cmdName,
        content: cmdContent,
        scope: "project",
        slug,
      }),
    onSuccess: () => {
      invalidateConfig();
      setCmdName("");
      setCmdContent("");
      setShowAddCmd(false);
    },
  });

  const removeCmdMutation = useMutation({
    mutationFn: (params: { name: string; scope: "user" | "project" }) =>
      client.skills.removeCommand({
        ...params,
        ...(params.scope === "project" ? { slug } : {}),
      }),
    onSuccess: invalidateConfig,
  });

  const handleInspect = async (
    serverName: string,
    scope: "user" | "local" | "project"
  ) => {
    const key = `${scope}:${serverName}`;
    if (inspectingMcp === key) {
      setInspectingMcp(null);
      return;
    }
    setInspectingMcp(key);
    try {
      const result = await client.mcpServers.inspectTools({
        name: serverName,
        scope,
        slug,
      });
      setToolResults((prev) => ({ ...prev, [key]: result }));
    } catch (e) {
      setToolResults((prev) => ({
        ...prev,
        [key]: { tools: [], error: e instanceof Error ? e.message : "Failed" },
      }));
    }
  };

  const crons = allCrons?.filter((c) => c.projectSlug === slug) ?? [];
  const webhooks = allWebhooks?.filter((w) => w.projectSlug === slug) ?? [];
  const panes = allPanes?.filter((p) => p.projectSlug === slug) ?? [];

  const mcpList: { name: string; scope: "user" | "local" | "project" }[] = [];
  for (const name of Object.keys(config?.localMcpServers ?? {}))
    mcpList.push({ name, scope: "local" });
  for (const name of Object.keys(config?.mcpServers ?? {}))
    mcpList.push({ name, scope: "project" });
  for (const name of Object.keys(config?.userMcpServers ?? {}))
    mcpList.push({ name, scope: "user" });
  const agents = config?.agents ?? [];
  const skills = config?.skills ?? [];
  const skillItems = skills.filter((s) => s.type === "skill");
  const cmdItems = skills.filter((s) => s.type === "command");

  const enabledCrons = crons.filter((c) => c.enabled).length;
  const enabledWebhooks = webhooks.filter((w) => w.enabled).length;

  const parts: string[] = [];
  if (config) {
    if (mcpList.length > 0) parts.push(`${mcpList.length} MCP`);
    if (agents.length > 0) parts.push(`${agents.length} agents`);
    if (skillItems.length > 0) parts.push(`${skillItems.length} skills`);
    if (cmdItems.length > 0) parts.push(`${cmdItems.length} commands`);
    if (crons.length > 0) parts.push(`${enabledCrons}/${crons.length} crons`);
    if (webhooks.length > 0)
      parts.push(`${enabledWebhooks}/${webhooks.length} webhooks`);
    if (panes.length > 0) parts.push(`${panes.length} tmux`);
  }

  return (
    <div className="mb-4 rounded border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/30"
      >
        <ChevronIcon open={expanded} className="text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {parts.length > 0 ? parts.join(" · ") : "Skills & Config"}
        </span>
      </button>

      {expanded && (
        <TooltipProvider>
          <div className="border-t px-3 py-2 text-xs">
            {/* MCP Servers */}
            <div className="mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-medium text-muted-foreground">
                  MCP Servers
                </span>
                <button
                  onClick={() => setShowAddMcp(!showAddMcp)}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  {showAddMcp ? "cancel" : "+"}
                </button>
              </div>
              {showAddMcp && (
                <div className="mt-1.5 mb-2 flex flex-col gap-1.5">
                  <div className="flex gap-1.5">
                    <input
                      placeholder="Name"
                      value={mcpName}
                      onChange={(e) => setMcpName(e.target.value)}
                      className="w-28 rounded border bg-background px-1.5 py-0.5 text-[11px]"
                    />
                    <select
                      value={mcpTransport}
                      onChange={(e) =>
                        setMcpTransport(e.target.value as typeof mcpTransport)
                      }
                      className="rounded border bg-background px-1 text-[11px]"
                    >
                      <option value="stdio">stdio</option>
                      <option value="http">http</option>
                      <option value="sse">sse</option>
                    </select>
                    {mcpTransport === "stdio" ? (
                      <>
                        <input
                          placeholder="Command"
                          value={mcpCommand}
                          onChange={(e) => setMcpCommand(e.target.value)}
                          className="w-24 rounded border bg-background px-1.5 py-0.5 text-[11px]"
                        />
                        <input
                          placeholder="Args"
                          value={mcpArgs}
                          onChange={(e) => setMcpArgs(e.target.value)}
                          className="flex-1 rounded border bg-background px-1.5 py-0.5 text-[11px]"
                        />
                      </>
                    ) : (
                      <input
                        placeholder="URL"
                        value={mcpUrl}
                        onChange={(e) => setMcpUrl(e.target.value)}
                        className="flex-1 rounded border bg-background px-1.5 py-0.5 text-[11px]"
                      />
                    )}
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      disabled={
                        !mcpName ||
                        (mcpTransport === "stdio" ? !mcpCommand : !mcpUrl) ||
                        addMcpMutation.isPending
                      }
                      onClick={() => addMcpMutation.mutate()}
                    >
                      {addMcpMutation.isPending ? "..." : "Add"}
                    </Button>
                  </div>
                  {addMcpMutation.data && !addMcpMutation.data.success && (
                    <span className="text-[10px] text-red-400">
                      {addMcpMutation.data.error}
                    </span>
                  )}
                </div>
              )}
              {mcpList.length > 0 && (
                <div className="mt-1 flex flex-col gap-1">
                  {mcpList.map((m) => {
                    const allServers: Record<
                      string,
                      Record<string, unknown>
                    > = {
                      ...((config?.localMcpServers ?? {}) as Record<
                        string,
                        Record<string, unknown>
                      >),
                      ...((config?.mcpServers ?? {}) as Record<
                        string,
                        Record<string, unknown>
                      >),
                      ...((config?.userMcpServers ?? {}) as Record<
                        string,
                        Record<string, unknown>
                      >),
                    };
                    const cfg = allServers[m.name];
                    const serverType = (cfg?.type as string) ?? "stdio";
                    const command = cfg?.command as string | undefined;
                    const args = cfg?.args as string[] | undefined;
                    const key = `${m.scope}:${m.name}`;
                    const isInspecting = inspectingMcp === key;
                    const tools = toolResults[key];

                    return (
                      <div key={`${m.name}-${m.scope}`}>
                        <div className="flex items-center gap-1.5">
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="text-[10px]">
                                {m.name}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-medium">{m.name}</span>
                                <span className="text-[10px] opacity-70">
                                  {serverType} · {m.scope}
                                </span>
                                {command && (
                                  <span className="font-mono text-[10px] opacity-70">
                                    {command}
                                    {args?.length ? ` ${args[0]}` : ""}
                                  </span>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                          <span className="text-[10px] text-muted-foreground">
                            {m.scope}
                          </span>
                          <button
                            onClick={() => handleInspect(m.name, m.scope)}
                            className="text-[10px] text-muted-foreground hover:text-foreground"
                          >
                            {isInspecting ? "hide" : "tools"}
                          </button>
                          <button
                            onClick={() =>
                              removeMcpMutation.mutate({
                                name: m.name,
                                scope: m.scope,
                              })
                            }
                            className="text-muted-foreground hover:text-destructive"
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
                              className="h-2.5 w-2.5"
                            >
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        {isInspecting && tools && (
                          <div className="ml-4 mt-1 rounded border bg-muted/20 px-2 py-1.5">
                            {tools.error ? (
                              <span className="text-[10px] text-red-400">
                                {tools.error}
                              </span>
                            ) : tools.tools.length === 0 ? (
                              <span className="text-[10px] text-muted-foreground">
                                No tools
                              </span>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground">
                                  {tools.tools.length} tools
                                </span>
                                {tools.tools.map((t) => (
                                  <div key={t.name}>
                                    <div className="flex items-start gap-1.5">
                                      <button
                                        onClick={() =>
                                          setExpandedSchema(
                                            expandedSchema ===
                                              `${key}:${t.name}`
                                              ? null
                                              : `${key}:${t.name}`
                                          )
                                        }
                                        className="font-mono text-[10px] hover:underline"
                                      >
                                        {t.name}
                                      </button>
                                      {t.description && (
                                        <span className="text-[10px] text-muted-foreground truncate">
                                          {t.description}
                                        </span>
                                      )}
                                    </div>
                                    {expandedSchema === `${key}:${t.name}` &&
                                      !!t.inputSchema && (
                                        <pre className="mt-0.5 max-h-32 overflow-auto rounded bg-muted/30 p-1 text-[9px] text-muted-foreground">
                                          {JSON.stringify(
                                            t.inputSchema,
                                            null,
                                            2
                                          )}
                                        </pre>
                                      )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {isInspecting && !tools && (
                          <div className="ml-4 mt-1 text-[10px] text-muted-foreground animate-pulse">
                            Connecting...
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Agents (read-only) */}
            {agents.length > 0 && (
              <div className="mb-2">
                <span className="text-[10px] font-medium text-muted-foreground">
                  Agents
                </span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {agents.map((a) => (
                    <Tooltip key={a.name}>
                      <TooltipTrigger>
                        <Badge variant="outline" className="text-[10px]">
                          {a.name}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{a.name}</span>
                          {a.description && (
                            <span className="text-[10px] opacity-70">
                              {a.description}
                            </span>
                          )}
                          {a.model && (
                            <span className="text-[10px] opacity-50">
                              {a.model}
                            </span>
                          )}
                          {a.tools && (
                            <span className="text-[10px] opacity-50">
                              tools: {a.tools}
                            </span>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}

            {/* Skills (read-only) */}
            {skillItems.length > 0 && (
              <div className="mb-2">
                <span className="text-[10px] font-medium text-muted-foreground">
                  Skills
                </span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {skillItems.map((s) => (
                    <Tooltip key={s.name}>
                      <TooltipTrigger>
                        <Badge variant="secondary" className="text-[10px]">
                          /{s.name}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">/{s.name}</span>
                          {s.description && (
                            <span className="text-[10px] opacity-70">
                              {s.description}
                            </span>
                          )}
                          <span className="text-[10px] opacity-50">
                            {s.scope}
                          </span>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}

            {/* Commands (with add/delete) */}
            <div className="mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-medium text-muted-foreground">
                  Commands
                </span>
                <button
                  onClick={() => setShowAddCmd(!showAddCmd)}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  {showAddCmd ? "cancel" : "+"}
                </button>
              </div>
              {showAddCmd && (
                <div className="mt-1.5 mb-2 flex flex-col gap-1.5">
                  <div className="flex gap-1.5">
                    <input
                      placeholder="Name"
                      value={cmdName}
                      onChange={(e) => setCmdName(e.target.value)}
                      className="w-32 rounded border bg-background px-1.5 py-0.5 text-[11px]"
                    />
                  </div>
                  <textarea
                    placeholder="Command content..."
                    value={cmdContent}
                    onChange={(e) => setCmdContent(e.target.value)}
                    className="min-h-[60px] rounded border bg-background px-2 py-1 text-[11px] font-mono"
                  />
                  <Button
                    size="sm"
                    className="h-6 w-fit px-2 text-[10px]"
                    disabled={
                      !cmdName || !cmdContent || addCmdMutation.isPending
                    }
                    onClick={() => addCmdMutation.mutate()}
                  >
                    {addCmdMutation.isPending ? "..." : "Add"}
                  </Button>
                </div>
              )}
              {cmdItems.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {cmdItems.map((s) => (
                    <Tooltip key={s.name}>
                      <TooltipTrigger>
                        <span className="inline-flex items-center gap-0.5">
                          <Badge variant="secondary" className="text-[10px]">
                            /{s.name}
                            {s.scope === "project" && (
                              <span className="ml-1 text-muted-foreground">
                                proj
                              </span>
                            )}
                          </Badge>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeCmdMutation.mutate({
                                name: s.name,
                                scope: s.scope as "user" | "project",
                              });
                            }}
                            className="text-muted-foreground hover:text-destructive"
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
                              className="h-2.5 w-2.5"
                            >
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">/{s.name}</span>
                          {s.description && (
                            <span className="text-[10px] opacity-70">
                              {s.description}
                            </span>
                          )}
                          <span className="text-[10px] opacity-50">
                            {s.scope}
                          </span>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}

// --- Artifact preview overlay ---

const VIEWABLE_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".pdf",
]);

function isViewable(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return VIEWABLE_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

function ArtifactPreview({
  slug,
  path,
  onClose,
}: {
  slug: string;
  path: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <span className="flex-1 truncate text-xs text-muted-foreground font-mono">
          {path}
        </span>
        <a
          href={`/api/artifacts/${slug}/${encodeURI(path)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Open in tab
        </a>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <iframe
        src={`/api/artifacts/${slug}/${encodeURI(path)}`}
        sandbox="allow-scripts"
        className="flex-1 w-full border-0"
        title={path}
      />
    </div>
  );
}

// --- Recursive file tree ---

type DirEntry = { name: string; isDirectory: boolean; size: number };

function gitStatusBadge(status: string) {
  if (status === "??" || status === "A")
    return <span className="shrink-0 ml-0.5 text-[9px] font-bold text-green-400">{status === "??" ? "U" : "A"}</span>;
  if (status.includes("D"))
    return <span className="shrink-0 ml-0.5 text-[9px] font-bold text-red-400/70">D</span>;
  return <span className="shrink-0 ml-0.5 text-[9px] font-bold text-yellow-400">M</span>;
}

function FileTreeEntries({
  entries,
  slug,
  parentPath,
  depth,
  dirCache,
  expanded,
  onToggle,
  previewPath,
  previewContent,
  onPreview,
  onOpenArtifact,
  gitStatus,
  diffPath,
  diffContent,
  onDiff,
  newFolderParent,
  newFolderName,
  onNewFolderNameChange,
  onNewFolderSubmit,
  onNewFolderCancel,
}: {
  entries: DirEntry[];
  slug: string;
  parentPath: string;
  depth: number;
  dirCache: Map<string, DirEntry[]>;
  expanded: Set<string>;
  onToggle: (fullPath: string) => void;
  previewPath: string | null;
  previewContent: string | null;
  onPreview: (fullPath: string) => void;
  onOpenArtifact: (fullPath: string) => void;
  gitStatus?: Map<string, string>;
  diffPath?: string | null;
  diffContent?: string | null;
  onDiff?: (fullPath: string) => void;
  newFolderParent?: string | null;
  newFolderName?: string;
  onNewFolderNameChange?: (name: string) => void;
  onNewFolderSubmit?: (name: string) => void;
  onNewFolderCancel?: () => void;
}) {
  return (
    <>
      {entries.map((entry) => {
        const fullPath = parentPath
          ? `${parentPath}/${entry.name}`
          : entry.name;
        const isOpen = expanded.has(fullPath);
        const children = dirCache.get(fullPath);
        const isPreviewing = previewPath === fullPath;
        const fileGitStatus = !entry.isDirectory ? gitStatus?.get(fullPath) : undefined;
        const isChanged = fileGitStatus !== undefined;
        const isDiffing = diffPath === fullPath;
        return (
          <div key={entry.name}>
            <div
              className={`group flex items-center gap-1 py-0.5 ${entry.isDirectory ? "cursor-pointer hover:bg-accent/50" : "cursor-pointer hover:bg-accent/30"}`}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={
                entry.isDirectory
                  ? () => onToggle(fullPath)
                  : isChanged && onDiff
                  ? () => onDiff(fullPath)
                  : () => onPreview(fullPath)
              }
            >
              <span className="w-3 shrink-0 text-muted-foreground text-[10px]">
                {entry.isDirectory ? (isOpen ? "▾" : "▸") : ""}
              </span>
              <span
                className={`text-xs ${entry.isDirectory ? "font-medium" : isPreviewing || isDiffing ? "text-foreground" : isChanged ? "text-foreground/80" : "text-muted-foreground"}`}
              >
                {entry.name}
                {entry.isDirectory ? "/" : ""}
              </span>
              {isChanged && fileGitStatus && gitStatusBadge(fileGitStatus)}
              {!entry.isDirectory && (
                <>
                  {entry.size > 0 && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {formatSize(entry.size)}
                    </span>
                  )}
                  {isViewable(entry.name) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenArtifact(fullPath);
                      }}
                      className="shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                      title="Open in preview"
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
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" x2="21" y1="14" y2="3" />
                      </svg>
                    </button>
                  )}
                  <a
                    href={`/api/files?slug=${slug}&path=${encodeURIComponent(fullPath)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 pr-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                    title="Download"
                    download
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
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" x2="12" y1="15" y2="3" />
                    </svg>
                  </a>
                </>
              )}
            </div>
            {/* Diff view for changed files */}
            {!entry.isDirectory && isDiffing && diffContent != null && diffContent !== "(no diff)" && (
              <div style={{ paddingLeft: `${depth * 16 + 8}px` }} className="py-1 pr-1">
                <div className="max-h-96 overflow-auto rounded border text-[11px]">
                  <PatchDiff
                    patch={diffContent}
                    options={{
                      diffStyle: "unified",
                      themeType: "dark",
                      disableFileHeader: true,
                      lineDiffType: "word",
                    }}
                  />
                </div>
              </div>
            )}
            {!entry.isDirectory && isDiffing && diffContent === null && (
              <div
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                className="py-0.5 text-[10px] text-muted-foreground animate-pulse"
              >
                loading diff...
              </div>
            )}
            {!entry.isDirectory && isDiffing && diffContent === "(no diff)" && (
              <div
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                className="py-0.5 text-[10px] text-muted-foreground"
              >
                no diff available
              </div>
            )}
            {/* Plain preview for unmodified files */}
            {!entry.isDirectory && !isChanged && isPreviewing && previewContent !== null && (
              <div style={{ paddingLeft: `${depth * 16 + 8}px` }}>
                <pre className="max-h-64 overflow-auto rounded border bg-muted/30 p-2 text-[11px] text-muted-foreground">
                  {previewContent}
                </pre>
              </div>
            )}
            {!entry.isDirectory && !isChanged && isPreviewing && previewContent === null && (
              <div
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                className="py-0.5 text-[10px] text-muted-foreground animate-pulse"
              >
                loading...
              </div>
            )}
            {entry.isDirectory && isOpen && children && (
              <>
                {newFolderParent === fullPath &&
                  onNewFolderNameChange &&
                  onNewFolderSubmit &&
                  onNewFolderCancel && (
                    <div
                      className="flex items-center gap-1 py-0.5"
                      style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                    >
                      <span className="w-3 shrink-0 text-muted-foreground text-[10px]">
                        +
                      </span>
                      <input
                        autoFocus
                        value={newFolderName ?? ""}
                        onChange={(e) => onNewFolderNameChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            (newFolderName ?? "").trim()
                          ) {
                            onNewFolderSubmit((newFolderName ?? "").trim());
                          }
                          if (e.key === "Escape") onNewFolderCancel();
                        }}
                        onBlur={() => {
                          if (!(newFolderName ?? "").trim())
                            onNewFolderCancel();
                        }}
                        placeholder="folder name..."
                        className="flex-1 bg-transparent text-xs outline-none"
                      />
                    </div>
                  )}
                <FileTreeEntries
                  entries={children}
                  slug={slug}
                  parentPath={fullPath}
                  depth={depth + 1}
                  dirCache={dirCache}
                  expanded={expanded}
                  onToggle={onToggle}
                  previewPath={previewPath}
                  previewContent={previewContent}
                  onPreview={onPreview}
                  onOpenArtifact={onOpenArtifact}
                  gitStatus={gitStatus}
                  diffPath={diffPath}
                  diffContent={diffContent}
                  onDiff={onDiff}
                  newFolderParent={newFolderParent}
                  newFolderName={newFolderName}
                  onNewFolderNameChange={onNewFolderNameChange}
                  onNewFolderSubmit={onNewFolderSubmit}
                  onNewFolderCancel={onNewFolderCancel}
                />
              </>
            )}
            {entry.isDirectory && isOpen && !children && (
              <div
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                className="py-0.5 text-[10px] text-muted-foreground animate-pulse"
              >
                loading...
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function ProjectFiles({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const [showFiles, setShowFiles] = useState(false);
  const { data: entries, isLoading } = useQuery({
    ...orpc.projects.files.queryOptions({ input: { slug } }),
    enabled: showFiles,
  });
  const { data: gitStatusData } = useQuery({
    ...orpc.projects.gitStatus.queryOptions({ input: { slug } }),
    enabled: showFiles,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const gitStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    gitStatusData?.changes.forEach(({ path, status }) => map.set(path, status));
    return map;
  }, [gitStatusData]);
  const [dirCache, setDirCache] = useState<Map<string, DirEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [diffPath, setDiffPath] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [artifactPath, setArtifactPath] = useState<string | null>(null);
  const [selectedDir, setSelectedDir] = useState("");
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshDir = useCallback(
    async (dir: string) => {
      if (dir === "") {
        void queryClient.invalidateQueries({
          queryKey: orpc.projects.files.queryOptions({ input: { slug } })
            .queryKey,
        });
      } else {
        const fresh = await client.projects.files({ slug, subpath: dir });
        setDirCache((prev) => new Map(prev).set(dir, fresh));
      }
    },
    [slug, queryClient]
  );

  const toggleDir = useCallback(
    async (fullPath: string) => {
      if (expanded.has(fullPath)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(fullPath);
          return next;
        });
        // Revert selectedDir to parent or root
        const parent = fullPath.includes("/")
          ? fullPath.slice(0, fullPath.lastIndexOf("/"))
          : "";
        setSelectedDir(parent);
        return;
      }
      if (!dirCache.has(fullPath)) {
        const entries = await client.projects.files({
          slug,
          subpath: fullPath,
        });
        setDirCache((prev) => new Map(prev).set(fullPath, entries));
      }
      setExpanded((prev) => new Set(prev).add(fullPath));
      setSelectedDir(fullPath);
    },
    [expanded, dirCache, slug]
  );

  const previewFile = useCallback(
    async (fullPath: string) => {
      if (previewPath === fullPath) {
        setPreviewPath(null);
        setPreviewContent(null);
        return;
      }
      setPreviewPath(fullPath);
      setPreviewContent(null);
      try {
        const result = await client.projects.readFile({ slug, path: fullPath });
        setPreviewContent(result.content);
      } catch {
        setPreviewContent("(unable to preview)");
      }
    },
    [previewPath, slug]
  );

  const handleDiff = useCallback(
    async (fullPath: string) => {
      if (diffPath === fullPath) {
        setDiffPath(null);
        setDiffContent(null);
        return;
      }
      setDiffPath(fullPath);
      setDiffContent(null);
      try {
        const result = await client.projects.gitDiff({ slug, path: fullPath });
        setDiffContent(result?.diff ?? "(no diff)");
      } catch {
        setDiffContent("(no diff)");
      }
    },
    [diffPath, slug]
  );

  const handleUpload = useCallback(
    async (files: FileList) => {
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          const form = new FormData();
          form.append("slug", slug);
          form.append("path", selectedDir);
          form.append("file", file);
          await fetch("/api/files", { method: "POST", body: form });
        }
        await refreshDir(selectedDir);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [slug, selectedDir, refreshDir]
  );

  const createFolder = useMutation({
    mutationFn: (name: string) =>
      client.projects.createDir({
        slug,
        subpath: newFolderParent ?? undefined,
        name,
      }),
    onSuccess: async () => {
      const parent = newFolderParent ?? "";
      await refreshDir(parent);
      if (parent && !expanded.has(parent)) {
        setExpanded((prev) => new Set(prev).add(parent));
      }
      setNewFolderParent(null);
      setNewFolderName("");
    },
  });

  return (
    <div className="mb-4">
      <button
        onClick={() => setShowFiles(!showFiles)}
        className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronIcon open={showFiles} />
        Files
        {entries && (
          <span className="text-[10px] font-normal">({entries.length})</span>
        )}
        {gitStatusData?.isRepo && gitStatusData.branch && (
          <span className="text-[10px] font-normal text-muted-foreground/70">
            {gitStatusData.branch}
          </span>
        )}
        {gitStatusData?.isRepo && gitStatusData.changes.length > 0 && (
          <span className="text-[10px] font-normal text-yellow-400">
            {gitStatusData.changes.length} change{gitStatusData.changes.length !== 1 ? "s" : ""}
          </span>
        )}
      </button>
      {showFiles && isLoading && (
        <div className="py-1 text-[10px] text-muted-foreground animate-pulse">
          loading...
        </div>
      )}
      {showFiles && entries && (
        <>
          <div className="mb-1 flex items-center gap-2 text-[10px]">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded border px-2 py-0.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
            <button
              onClick={() => {
                setNewFolderParent(selectedDir);
                setNewFolderName("");
              }}
              className="rounded border px-2 py-0.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              New Folder
            </button>
            <span className="text-muted-foreground">
              in: {selectedDir || "/"}
            </span>
            <input
              type="file"
              hidden
              ref={fileInputRef}
              multiple
              onChange={(e) => {
                if (e.target.files?.length) void handleUpload(e.target.files);
              }}
            />
          </div>
          <div className="rounded border text-xs">
            {newFolderParent === "" && (
              <div className="flex items-center gap-1 px-2 py-0.5">
                <span className="w-3 shrink-0 text-muted-foreground text-[10px]">
                  +
                </span>
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFolderName.trim()) {
                      createFolder.mutate(newFolderName.trim());
                    }
                    if (e.key === "Escape") {
                      setNewFolderParent(null);
                      setNewFolderName("");
                    }
                  }}
                  onBlur={() => {
                    if (!newFolderName.trim()) {
                      setNewFolderParent(null);
                      setNewFolderName("");
                    }
                  }}
                  placeholder="folder name..."
                  className="flex-1 bg-transparent text-xs outline-none"
                />
              </div>
            )}
            <FileTreeEntries
              entries={entries}
              slug={slug}
              parentPath=""
              depth={0}
              dirCache={dirCache}
              expanded={expanded}
              onToggle={toggleDir}
              previewPath={previewPath}
              previewContent={previewContent}
              onPreview={previewFile}
              onOpenArtifact={setArtifactPath}
              gitStatus={gitStatusMap}
              diffPath={diffPath}
              diffContent={diffContent}
              onDiff={handleDiff}
              newFolderParent={newFolderParent}
              newFolderName={newFolderName}
              onNewFolderNameChange={setNewFolderName}
              onNewFolderSubmit={(name) => createFolder.mutate(name)}
              onNewFolderCancel={() => {
                setNewFolderParent(null);
                setNewFolderName("");
              }}
            />
            {entries.length === 0 && newFolderParent !== "" && (
              <div className="px-2 py-1 text-[10px] text-muted-foreground italic">
                empty
              </div>
            )}
          </div>
        </>
      )}
      {artifactPath && (
        <ArtifactPreview
          slug={slug}
          path={artifactPath}
          onClose={() => setArtifactPath(null)}
        />
      )}
    </div>
  );
}

// --- Tmux: grouped by window ---

function ProjectTmux({ slug }: { slug: string }) {
  const [showTmux, setShowTmux] = useState(true);
  const { data: allPanes } = useQuery({
    ...orpc.tmux.panes.queryOptions(),
    refetchInterval: 30000,
    enabled: showTmux,
  });
  const { data: serverConfig } = useQuery(orpc.server.config.queryOptions());

  const sshTarget = serverConfig?.sshHost ?? undefined;
  const panes = allPanes?.filter((p) => p.projectSlug === slug) ?? [];

  // group by session:window
  const byWindow = new Map<string, typeof panes>();
  const sessionNames = new Set<string>();
  for (const p of panes) {
    const key = `${p.session}:${p.window}`;
    const list = byWindow.get(key) ?? [];
    list.push(p);
    byWindow.set(key, list);
    sessionNames.add(p.session);
  }

  return (
    <div className="mb-4">
      <button
        onClick={() => setShowTmux(!showTmux)}
        className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronIcon open={showTmux} />
        Tmux
        {panes.length > 0 && (
          <span className="text-[10px] font-normal">({panes.length})</span>
        )}
      </button>
      {showTmux && panes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {Array.from(sessionNames).map((session) => (
            <div
              key={`session-${session}`}
              className="flex items-center gap-2 rounded border bg-muted/20 px-2 py-1"
            >
              <span className="font-mono text-[10px] text-muted-foreground">
                session: {session}
              </span>
              <span className="flex-1" />
              <CopyButton
                text={generateAttachCommand({
                  sessionName: session,
                  sshTarget,
                })}
              />
            </div>
          ))}
          {Array.from(byWindow.entries()).map(([windowKey, windowPanes]) => {
            const first = windowPanes[0];
            return (
              <div
                key={windowKey}
                className="flex items-center gap-2 rounded border px-2 py-1.5"
              >
                <span className="font-mono text-xs">{windowKey}</span>
                {windowPanes.length > 1 && (
                  <Badge variant="outline" className="text-[10px]">
                    {windowPanes.length} panes
                  </Badge>
                )}
                <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                  {first.cwd}
                </span>
                <CopyButton
                  text={generateAttachCommand({
                    sessionName: first.session,
                    windowKey,
                    sshTarget,
                  })}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Tmux launcher ---

function TmuxLauncher({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const { data: projects } = useQuery({
    ...orpc.projects.list.queryOptions(),
    enabled: showForm,
  });
  const { data: serverConfig } = useQuery(orpc.server.config.queryOptions());
  const project = projects?.find((p) => p.slug === slug);
  const [panelCount, setPanelCount] = useState(2);
  const [layout, setLayout] = useState<TmuxLayout>("even-horizontal");
  const [resumeIds, setResumeIds] = useState<(string | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  const [printMode, setPrintMode] = useState(false);
  const [skipPermissions, setSkipPermissions] = useState(false);
  const [model, setModel] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [sshTarget, setSshTarget] = useState("");
  const [sshPrefilled, setSshPrefilled] = useState(false);
  const [prompts, setPrompts] = useState<(string | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  const [showTips, setShowTips] = useState(false);
  const [noTmux, setNoTmux] = useState(false);
  const [ccMode, setCcMode] = useState(false);
  const [customCommands, setCustomCommands] = useState<(string | null)[]>([
    null,
    null,
    null,
    null,
  ]);

  // Pre-fill SSH target from server config (once)
  if (serverConfig?.sshHost && !sshPrefilled && !sshTarget) {
    setSshTarget(serverConfig.sshHost);
    setSshPrefilled(true);
  }

  const { data: sessions } = useQuery({
    ...orpc.sessions.list.queryOptions({ input: { slug } }),
    enabled: showForm,
  });

  const projectName = project?.path.split("/").pop() ?? slug;
  const budgetNum = maxBudget ? Number(maxBudget) : undefined;
  const activeCustomCmds = customCommands.slice(0, panelCount);
  const hasCustomCmds = activeCustomCmds.some((c) => c);
  const command = generateTmuxCommand({
    sessionName: `claude-${projectName}`,
    projectPath: project?.path ?? "",
    panelCount,
    layout,
    resumeSessionIds: resumeIds.slice(0, panelCount),
    printMode,
    skipPermissions,
    model: model || undefined,
    maxBudgetUsd: budgetNum && budgetNum > 0 ? budgetNum : undefined,
    sshTarget: sshTarget || undefined,
    prompts: printMode ? prompts.slice(0, panelCount) : undefined,
    noTmux,
    ccMode: !noTmux && ccMode,
    customCommands: hasCustomCmds ? activeCustomCmds : undefined,
  });

  const handlePanelCountChange = (count: number) => {
    setPanelCount(count);
    if (count === 1) return;
    if (count >= 4) setLayout("tiled");
    else setLayout("even-horizontal");
  };

  const launchMutation = useMutation({
    mutationFn: () =>
      client.tmux.launch({
        sessionName: `claude-${projectName}`,
        projectPath: project?.path ?? "",
        panelCount,
        layout,
        resumeSessionIds: resumeIds.slice(0, panelCount),
        skipPermissions: skipPermissions || undefined,
        model: model || undefined,
        maxBudgetUsd: budgetNum && budgetNum > 0 ? budgetNum : undefined,
        customCommands: hasCustomCmds ? activeCustomCmds : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orpc.tmux.panes.queryOptions().queryKey,
      });
    },
  });

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          {noTmux ? "Launch Claude" : "Launch Tmux"}
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          {showForm ? "cancel" : "+"}
        </button>
      </div>

      {showForm && (
        <div className="mt-2 flex flex-col gap-2">
          {/* Row 1: panel count + layout + no-tmux toggle */}
          <div className="flex items-center gap-2">
            <select
              value={panelCount}
              onChange={(e) => handlePanelCountChange(Number(e.target.value))}
              className="rounded border bg-background px-2 py-1 text-xs"
            >
              <option value={1}>1 {noTmux ? "instance" : "panel"}</option>
              <option value={2}>2 {noTmux ? "instances" : "panels"}</option>
              <option value={3}>3 {noTmux ? "instances" : "panels"}</option>
              <option value={4}>4 {noTmux ? "instances" : "panels"}</option>
            </select>
            {!noTmux && panelCount > 1 && (
              <select
                value={layout}
                onChange={(e) => setLayout(e.target.value as TmuxLayout)}
                className="rounded border bg-background px-2 py-1 text-xs"
              >
                <option value="even-horizontal">Side by side</option>
                <option value="even-vertical">Stacked</option>
                <option value="tiled">Grid (2x2)</option>
                <option value="main-vertical">Main + side</option>
              </select>
            )}
            {!noTmux && (
              <label className="ml-auto flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={ccMode}
                  onChange={(e) => setCcMode(e.target.checked)}
                  className="h-3 w-3"
                />
                <span className="text-muted-foreground">-CC (iTerm2)</span>
              </label>
            )}
            <label
              className={`flex items-center gap-1 text-xs ${noTmux ? "ml-auto" : ""}`}
            >
              <input
                type="checkbox"
                checked={noTmux}
                onChange={(e) => setNoTmux(e.target.checked)}
                className="h-3 w-3"
              />
              <span className="text-muted-foreground">No tmux</span>
            </label>
          </div>

          {/* Row 2: flags */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={printMode}
                onChange={(e) => setPrintMode(e.target.checked)}
                className="h-3 w-3"
              />
              <span className="text-muted-foreground">-p mode</span>
            </label>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={skipPermissions}
                onChange={(e) => setSkipPermissions(e.target.checked)}
                className="h-3 w-3"
              />
              <span className="text-muted-foreground">Skip permissions</span>
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded border bg-background px-2 py-1 text-xs"
            >
              <option value="">Default model</option>
              <option value="sonnet">sonnet</option>
              <option value="opus">opus</option>
              <option value="haiku">haiku</option>
            </select>
            <Input
              type="number"
              placeholder="Max $"
              value={maxBudget}
              onChange={(e) => setMaxBudget(e.target.value)}
              className="w-20 text-xs"
              min={0}
              step={0.5}
            />
          </div>

          {/* Row 3: SSH target */}
          <Input
            placeholder="SSH target (user@host)"
            value={sshTarget}
            onChange={(e) => setSshTarget(e.target.value)}
            className="text-xs"
          />

          {/* Per-panel: resume + prompt */}
          <div className="flex flex-col gap-1">
            {Array.from({ length: panelCount }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[10px] text-muted-foreground">
                  Panel {i + 1}
                </span>
                {sessions && sessions.length > 0 && (
                  <select
                    value={resumeIds[i] ?? ""}
                    onChange={(e) => {
                      const next = [...resumeIds];
                      next[i] = e.target.value || null;
                      setResumeIds(next);
                    }}
                    className="rounded border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">New session</option>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        Resume: {s.firstPrompt.slice(0, 40)}
                        {s.firstPrompt.length > 40 ? "..." : ""}
                      </option>
                    ))}
                  </select>
                )}
                <Input
                  placeholder="Custom cmd (overrides claude)"
                  value={customCommands[i] ?? ""}
                  onChange={(e) => {
                    const next = [...customCommands];
                    next[i] = e.target.value || null;
                    setCustomCommands(next);
                  }}
                  className="flex-1 text-xs"
                />
                {printMode && !customCommands[i] && (
                  <Input
                    placeholder="Prompt for this panel..."
                    value={prompts[i] ?? ""}
                    onChange={(e) => {
                      const next = [...prompts];
                      next[i] = e.target.value || null;
                      setPrompts(next);
                    }}
                    className="flex-1 text-xs"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Command preview + actions */}
          <div className="relative rounded border bg-muted/30 p-2">
            <pre className="overflow-x-auto pr-20 text-[11px] text-muted-foreground whitespace-pre-wrap">
              {command}
            </pre>
            <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
              {!noTmux && !sshTarget && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  disabled={launchMutation.isPending || !project?.path}
                  onClick={() => launchMutation.mutate()}
                >
                  {launchMutation.isPending
                    ? "..."
                    : launchMutation.isSuccess
                      ? "Launched"
                      : "Launch"}
                </Button>
              )}
              <CopyButton text={command} />
            </div>
            {launchMutation.isError && (
              <p className="mt-1 text-[10px] text-red-400">
                {launchMutation.error?.message ?? "Launch failed"}
              </p>
            )}
          </div>

          {/* Deployment tips */}
          <button
            onClick={() => setShowTips(!showTips)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <ChevronIcon open={showTips} />
            Deployment tips
          </button>
          {showTips && (
            <div className="rounded border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              <ul className="flex flex-col gap-1">
                {noTmux ? (
                  <>
                    <li>
                      Multiple instances run as background processes (using{" "}
                      <code className="rounded bg-muted px-1">&amp;</code>)
                    </li>
                    <li>
                      Without tmux, sessions won't survive SSH disconnect — pair
                      with <code className="rounded bg-muted px-1">nohup</code>{" "}
                      if needed
                    </li>
                  </>
                ) : (
                  <>
                    <li>Runs in detached tmux — survives SSH disconnect</li>
                    <li>
                      Reconnect:{" "}
                      <code className="rounded bg-muted px-1">
                        tmux attach -t claude-{projectName}
                      </code>
                    </li>
                    {ccMode && (
                      <>
                        <li>
                          <code className="rounded bg-muted px-1">-CC</code>{" "}
                          enables control mode — iTerm2/WezTerm will open tmux
                          panes as native tabs or split panes
                        </li>
                        <li>
                          Reconnect with:{" "}
                          <code className="rounded bg-muted px-1">
                            tmux -CC attach -t claude-{projectName}
                          </code>
                        </li>
                      </>
                    )}
                  </>
                )}
                <li>
                  With <code className="rounded bg-muted px-1">-p</code> mode,
                  each {noTmux ? "instance" : "panel"} runs its prompt and exits
                </li>
                <li>Budget cap prevents runaway costs on unattended runs</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Crons (collapsible) ---

function ProjectCrons({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const [showSection, setShowSection] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const { data: allCrons } = useQuery({
    ...orpc.crons.list.queryOptions(),
    refetchInterval: 30000,
    enabled: showSection || showForm,
  });

  const crons = allCrons?.filter((c) => c.projectSlug === slug) ?? [];
  const [preset, setPreset] = useState(CRON_PRESETS[0].value);
  const [customExpr, setCustomExpr] = useState("");
  const [prompt, setPrompt] = useState("");
  const [sessionId, setSessionId] = useState("");

  // Lazy-load: only fetch when form is open
  const { data: sessions } = useQuery({
    ...orpc.sessions.list.queryOptions({ input: { slug } }),
    enabled: showForm,
  });
  const { data: projects } = useQuery({
    ...orpc.projects.list.queryOptions(),
    enabled: showForm,
  });

  const expression = preset || customExpr;
  const isCustom = preset === "";

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.crons.list.queryOptions().queryKey,
    });

  const projectPath = projects?.find((p) => p.slug === slug)?.path;

  const createCron = useMutation({
    mutationFn: () =>
      client.crons.create({
        expression,
        prompt,
        projectSlug: slug,
        ...(projectPath ? { projectPath } : {}),
        ...(sessionId ? { sessionId } : {}),
      }),
    onSuccess: () => {
      void invalidate();
      setPreset(CRON_PRESETS[0].value);
      setCustomExpr("");
      setPrompt("");
      setSessionId("");
      setShowForm(false);
    },
  });

  const deleteCron = useMutation({
    mutationFn: (id: string) => client.crons.delete({ id }),
    onSuccess: invalidate,
  });

  const toggleCron = useMutation({
    mutationFn: (id: string) => client.crons.toggle({ id }),
    onSuccess: invalidate,
  });

  const sessionLookup = new Map(
    sessions?.map((s) => [s.id, s.firstPrompt]) ?? []
  );

  if (crons.length === 0 && !showForm) {
    return (
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Crons</h3>
          <button
            onClick={() => {
              setShowSection(true);
              setShowForm(true);
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            + add
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => setShowSection(!showSection)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronIcon open={showSection} />
          Crons
          <span className="text-[10px] font-normal">({crons.length})</span>
        </button>
        <button
          onClick={() => {
            setShowSection(true);
            setShowForm(!showForm);
          }}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          {showForm ? "cancel" : "+ add"}
        </button>
      </div>

      {showSection && (
        <>
          {showForm && (
            <div className="mb-3 flex flex-col gap-2">
              <div className="flex gap-2">
                <select
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                  className="rounded border bg-background px-2 text-xs"
                >
                  {CRON_PRESETS.map((p) => (
                    <option key={p.label} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {isCustom && (
                  <Input
                    placeholder="*/30 * * * *"
                    value={customExpr}
                    onChange={(e) => setCustomExpr(e.target.value)}
                    className="w-32 text-xs"
                  />
                )}
              </div>
              <div className="flex gap-2">
                <select
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  className="shrink-0 rounded border bg-background px-2 text-xs"
                >
                  <option value="">New session each run</option>
                  {sessions?.map((s) => (
                    <option key={s.id} value={s.id}>
                      Resume: {s.firstPrompt.slice(0, 40)}
                      {s.firstPrompt.length > 40 ? "..." : ""}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Prompt..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="flex-1 text-xs"
                />
                <Button
                  size="sm"
                  disabled={!expression || !prompt || createCron.isPending}
                  onClick={() => createCron.mutate()}
                >
                  {createCron.isPending ? "..." : "Add"}
                </Button>
              </div>
            </div>
          )}

          {crons.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {crons.map((cron) => (
                <div
                  key={cron.id}
                  className="flex items-center gap-2 rounded border px-2 py-1.5"
                >
                  <button
                    onClick={() => toggleCron.mutate(cron.id)}
                    className={`h-2.5 w-2.5 shrink-0 rounded-full border ${cron.enabled ? "bg-green-500 border-green-600" : "bg-muted border-muted-foreground/30"}`}
                    title={cron.enabled ? "Disable" : "Enable"}
                  />
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {cronToHuman(cron.expression)}
                  </span>
                  <Badge
                    variant="outline"
                    className="shrink-0 font-mono text-[10px]"
                  >
                    {cron.expression}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {cron.prompt}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {cron.sessionId
                      ? (sessionLookup.get(cron.sessionId)?.slice(0, 20) ??
                          cron.sessionId.slice(0, 8)) + "..."
                      : "new session"}
                  </span>
                  {cron.lastRunStatus && (
                    <span
                      className={`text-[10px] ${cron.lastRunStatus === "success" ? "text-green-400" : cron.lastRunStatus === "error" ? "text-red-400" : "text-muted-foreground"}`}
                    >
                      {cron.lastRunStatus}
                    </span>
                  )}
                  <button
                    onClick={() => deleteCron.mutate(cron.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
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
                      className="h-3 w-3"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Webhooks (collapsible) ---

function ProjectWebhooks({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const [showSection, setShowSection] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const { data: allWebhooks } = useQuery({
    ...orpc.webhooks.list.queryOptions(),
    refetchInterval: 30000,
    enabled: showSection || showForm,
  });

  const webhooks = allWebhooks?.filter((w) => w.projectSlug === slug) ?? [];
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<"linear" | "github" | "generic">(
    "generic"
  );
  const [prompt, setPrompt] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [signingSecret, setSigningSecret] = useState("");

  // Lazy-load: only fetch when form is open
  const { data: sessions } = useQuery({
    ...orpc.sessions.list.queryOptions({ input: { slug } }),
    enabled: showForm,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.webhooks.list.queryOptions().queryKey,
    });

  const createWebhook = useMutation({
    mutationFn: () =>
      client.webhooks.create({
        name,
        provider,
        prompt,
        projectSlug: slug,
        ...(sessionId ? { sessionId } : {}),
        ...(signingSecret ? { signingSecret } : {}),
      }),
    onSuccess: () => {
      void invalidate();
      setName("");
      setProvider("generic");
      setPrompt("");
      setSessionId("");
      setSigningSecret("");
      setShowForm(false);
    },
  });

  const deleteWebhook = useMutation({
    mutationFn: (id: string) => client.webhooks.delete({ id }),
    onSuccess: invalidate,
  });

  const toggleWebhook = useMutation({
    mutationFn: (id: string) => client.webhooks.toggle({ id }),
    onSuccess: invalidate,
  });

  const webhookUrl = (id: string) =>
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/${id}`
      : `/api/webhooks/${id}`;

  if (webhooks.length === 0 && !showForm) {
    return (
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            Webhooks
          </h3>
          <button
            onClick={() => {
              setShowSection(true);
              setShowForm(true);
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            + add
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => setShowSection(!showSection)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronIcon open={showSection} />
          Webhooks
          <span className="text-[10px] font-normal">({webhooks.length})</span>
        </button>
        <button
          onClick={() => {
            setShowSection(true);
            setShowForm(!showForm);
          }}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          {showForm ? "cancel" : "+ add"}
        </button>
      </div>

      {showSection && (
        <>
          {showForm && (
            <div className="mb-3 flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Name..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-32 text-xs"
                />
                <select
                  value={provider}
                  onChange={(e) =>
                    setProvider(e.target.value as typeof provider)
                  }
                  className="rounded border bg-background px-2 text-xs"
                >
                  <option value="generic">Generic</option>
                  <option value="linear">Linear</option>
                  <option value="github">GitHub</option>
                </select>
                <Input
                  type="password"
                  placeholder="Secret (optional)"
                  value={signingSecret}
                  onChange={(e) => setSigningSecret(e.target.value)}
                  className="w-32 text-xs"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  className="shrink-0 rounded border bg-background px-2 text-xs"
                >
                  <option value="">New session each time</option>
                  {sessions?.map((s) => (
                    <option key={s.id} value={s.id}>
                      Resume: {s.firstPrompt.slice(0, 40)}
                      {s.firstPrompt.length > 40 ? "..." : ""}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Prompt..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="flex-1 text-xs"
                />
                <Button
                  size="sm"
                  disabled={!name || !prompt || createWebhook.isPending}
                  onClick={() => createWebhook.mutate()}
                >
                  {createWebhook.isPending ? "..." : "Add"}
                </Button>
              </div>
            </div>
          )}

          {webhooks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {webhooks.map((wh) => (
                <div
                  key={wh.id}
                  className="flex items-center gap-2 rounded border px-2 py-1.5"
                >
                  <button
                    onClick={() => toggleWebhook.mutate(wh.id)}
                    className={`h-2.5 w-2.5 shrink-0 rounded-full border ${wh.enabled ? "bg-green-500 border-green-600" : "bg-muted border-muted-foreground/30"}`}
                    title={wh.enabled ? "Disable" : "Enable"}
                  />
                  <span className="shrink-0 text-xs font-medium">
                    {wh.name}
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {wh.provider}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {wh.prompt}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {wh.triggerCount}x
                  </span>
                  {wh.lastStatus && (
                    <span
                      className={`text-[10px] ${wh.lastStatus === "success" ? "text-green-400" : wh.lastStatus === "error" ? "text-red-400" : "text-muted-foreground"}`}
                    >
                      {wh.lastStatus}
                    </span>
                  )}
                  <CopyButton text={webhookUrl(wh.id)} />
                  <button
                    onClick={() => deleteWebhook.mutate(wh.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
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
                      className="h-3 w-3"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- CLAUDE.md ---

function ProjectClaudeMd({ slug }: { slug: string }) {
  const [show, setShow] = useState(false);
  const { data: config, isLoading } = useQuery(
    orpc.projects.config.queryOptions({ input: { slug } })
  );

  // Hide entirely when absent or still loading
  if (isLoading || !config?.claudeMd) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setShow(!show)}
        className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronIcon open={show} />
        CLAUDE.md
      </button>
      {show && (
        <pre className="max-h-64 overflow-auto rounded border p-2 text-[11px] text-muted-foreground">
          {config.claudeMd}
        </pre>
      )}
    </div>
  );
}

// --- Stats header ---

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function ProjectStatsHeader({ slug }: { slug: string }) {
  const [show, setShow] = useState(false);
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const project = projects?.find((p) => p.slug === slug);

  if (!project || (project.lastCost == null && project.lastDuration == null))
    return null;

  const primaryModel = project.lastModelUsage
    ? Object.entries(project.lastModelUsage).sort(
        (a, b) => b[1].costUSD - a[1].costUSD
      )[0]?.[0]
    : undefined;

  const stats = [
    project.lastCost != null && {
      label: "Cost",
      value: `$${project.lastCost.toFixed(2)}`,
    },
    project.lastDuration != null && {
      label: "Duration",
      value: formatDuration(project.lastDuration),
    },
    project.lastLinesAdded != null && {
      label: "Lines",
      value: `+${project.lastLinesAdded} / -${project.lastLinesRemoved ?? 0}`,
    },
    project.lastTotalInputTokens != null && {
      label: "Tokens",
      value: `${formatTokens(project.lastTotalInputTokens)} in / ${formatTokens(project.lastTotalOutputTokens ?? 0)} out`,
    },
    primaryModel && {
      label: "Model",
      value: primaryModel
        .replace("claude-", "")
        .split("-")
        .slice(0, 2)
        .join("-"),
    },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="mb-4">
      <button
        onClick={() => setShow(!show)}
        className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronIcon open={show} />
        Last session stats
      </button>
      {show && (
        <div className="flex flex-wrap gap-4 rounded border px-3 py-2">
          {stats.map((s) => (
            <div key={s.label} className="flex items-baseline gap-1.5">
              <span className="text-[10px] text-muted-foreground">
                {s.label}
              </span>
              <span className="text-xs tabular-nums">{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Page ---

export default function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const project = projects?.find((p) => p.slug === slug);
  const projectPath = project?.path;
  const shortPath = projectPath?.split("/").slice(-2).join("/") ?? slug;
  const gitRemoteUrl = project?.gitRemoteUrl;
  const gitDisplayHost = gitRemoteUrl
    ? gitRemoteUrl.replace(/^https?:\/\//, "")
    : null;

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-medium">Sessions for {shortPath}</h2>
        {gitDisplayHost && (
          <a
            href={gitRemoteUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            {gitDisplayHost}
          </a>
        )}
      </div>
      <ProjectStatsHeader slug={slug} />
      <ProjectSkills slug={slug} />
      <ProjectIntegrations slug={slug} />
      <ProjectTmux slug={slug} />
      <TmuxLauncher slug={slug} />
      <ProjectFiles slug={slug} />
      <ProjectClaudeMd slug={slug} />
      <ProjectCrons slug={slug} />
      <ProjectWebhooks slug={slug} />
      <SessionList projectSlug={slug} />
    </div>
  );
}
