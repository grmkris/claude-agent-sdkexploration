"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { TmuxPane } from "@/lib/types";

import { CopyButton } from "@/components/copy-button";
import { StarIcon, StarFilledIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { getTimeAgo } from "@/lib/utils";

function UserConfigBar() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery(orpc.user.config.queryOptions());

  if (!data) return <div className="h-8" />;

  const serverNames = Object.keys(data.mcpServers);
  const skills = data.skills.filter((s) => s.type === "skill");
  const commands = data.skills.filter((s) => s.type === "command");

  if (serverNames.length === 0 && data.skills.length === 0) return null;

  const parts: string[] = [];
  if (serverNames.length > 0) parts.push(`${serverNames.length} MCP`);
  if (skills.length > 0) parts.push(`${skills.length} skills`);
  if (commands.length > 0) parts.push(`${commands.length} commands`);

  return (
    <section className="p-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {parts.join(" · ")}
      </button>
      {open && (
        <TooltipProvider>
          <div className="mt-2 flex flex-col gap-2 pl-5 text-xs">
            {serverNames.length > 0 && (
              <div>
                <span className="text-[10px] text-muted-foreground">
                  MCP Servers
                </span>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {serverNames.map((name) => {
                    const cfg = data.mcpServers[name] as
                      | Record<string, unknown>
                      | undefined;
                    const serverType = (cfg?.type as string) ?? "stdio";
                    const command = cfg?.command as string | undefined;
                    const args = cfg?.args as string[] | undefined;
                    return (
                      <Tooltip key={name}>
                        <TooltipTrigger>
                          <Badge variant="outline" className="text-[10px]">
                            {name}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{name}</span>
                            <span className="text-[10px] opacity-70">
                              {serverType}
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
                    );
                  })}
                </div>
              </div>
            )}
            {skills.length > 0 && (
              <div>
                <span className="text-[10px] text-muted-foreground">
                  Skills
                </span>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {skills.map((s) => (
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
            {commands.length > 0 && (
              <div>
                <span className="text-[10px] text-muted-foreground">
                  Commands
                </span>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {commands.map((s) => (
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
          </div>
        </TooltipProvider>
      )}
    </section>
  );
}

function AutomationsSummary() {
  const { data: crons } = useQuery({
    ...orpc.crons.list.queryOptions(),
    refetchInterval: 30000,
  });
  const { data: webhooks } = useQuery({
    ...orpc.webhooks.list.queryOptions(),
    refetchInterval: 30000,
  });

  const activeCrons = crons?.filter((c) => c.enabled).length ?? 0;
  const activeWebhooks = webhooks?.filter((w) => w.enabled).length ?? 0;

  if (!crons && !webhooks) return <div className="h-6" />;
  if (activeCrons === 0 && activeWebhooks === 0) return null;

  const parts: string[] = [];
  if (activeCrons > 0)
    parts.push(`${activeCrons} cron${activeCrons > 1 ? "s" : ""} active`);
  if (activeWebhooks > 0)
    parts.push(
      `${activeWebhooks} webhook${activeWebhooks > 1 ? "s" : ""} active`
    );

  return (
    <section className="px-4 pb-2">
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        {parts.map((p, i) => (
          <span key={i}>{p}</span>
        ))}
        <Link href="/crons" className="hover:text-foreground">
          crons
        </Link>
        <Link href="/webhooks" className="hover:text-foreground">
          webhooks
        </Link>
      </div>
    </section>
  );
}

function TmuxInCard({ panes }: { panes: TmuxPane[] }) {
  // Group by session:window
  const byWindow = new Map<string, TmuxPane[]>();
  for (const p of panes) {
    const key = `${p.session}:${p.window}`;
    const list = byWindow.get(key) ?? [];
    list.push(p);
    byWindow.set(key, list);
  }

  return (
    <div className="mt-1.5 flex flex-col gap-0.5">
      {Array.from(byWindow.entries()).map(([windowKey, windowPanes]) => (
        <div key={windowKey} className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
          <span className="font-mono text-[10px] text-green-400">
            {windowKey}
          </span>
          {windowPanes.length > 1 && (
            <span className="text-[9px] text-muted-foreground">
              {windowPanes.length}p
            </span>
          )}
          <CopyButton text={`tmux attach -t ${windowKey}`} />
        </div>
      ))}
    </div>
  );
}

function NewProjectForm({ onCreated }: { onCreated: (slug: string) => void }) {
  const [parentDir, setParentDir] = useState("");
  const [name, setName] = useState("");
  const [initialPrompt, setInitialPrompt] = useState("");

  const createProject = useMutation({
    mutationFn: () =>
      client.projects.create({
        parentDir,
        name,
        ...(initialPrompt ? { initialPrompt } : {}),
      }),
    onSuccess: (result) => onCreated(result.slug),
  });

  return (
    <div className="flex flex-col gap-2 rounded border p-3">
      <Input
        placeholder="Parent directory (e.g. /Users/me/Code)"
        value={parentDir}
        onChange={(e) => setParentDir(e.target.value)}
        className="text-xs"
      />
      <Input
        placeholder="Project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="text-xs"
      />
      <textarea
        placeholder="Initial prompt (optional) — starts a Claude session to register the project"
        value={initialPrompt}
        onChange={(e) => setInitialPrompt(e.target.value)}
        rows={2}
        className="rounded border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground"
      />
      <Button
        size="sm"
        disabled={!parentDir || !name || createProject.isPending}
        onClick={() => createProject.mutate()}
      >
        {createProject.isPending ? "Creating..." : "Create"}
      </Button>
      {createProject.isError && (
        <span className="text-[10px] text-destructive">
          {(createProject.error as Error).message}
        </span>
      )}
    </div>
  );
}

function UnifiedProjectGrid() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showNewProject, setShowNewProject] = useState(false);
  const { data: projects, isLoading } = useQuery(
    orpc.projects.list.queryOptions()
  );
  const { data: favorites } = useQuery(orpc.favorites.get.queryOptions());
  const { data: tmuxPanes } = useQuery({
    ...orpc.tmux.panes.queryOptions(),
    refetchInterval: 30000,
  });

  const toggleProject = useMutation({
    mutationFn: (slug: string) => client.favorites.toggleProject({ slug }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orpc.favorites.get.queryOptions().queryKey,
      }),
  });

  const tmuxBySlug = new Map<string, TmuxPane[]>();
  if (tmuxPanes) {
    for (const p of tmuxPanes) {
      const list = tmuxBySlug.get(p.projectSlug) ?? [];
      list.push(p);
      tmuxBySlug.set(p.projectSlug, list);
    }
  }

  if (isLoading) {
    return (
      <section className="p-4">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Projects
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </section>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <section className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Projects</h2>
          <button
            onClick={() => setShowNewProject(!showNewProject)}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            {showNewProject ? "cancel" : "+ New Project"}
          </button>
        </div>
        {showNewProject && (
          <NewProjectForm
            onCreated={(slug) => {
              queryClient.invalidateQueries({
                queryKey: orpc.projects.list.queryOptions().queryKey,
              });
              router.push(`/project/${slug}`);
            }}
          />
        )}
        {!showNewProject && (
          <div className="text-sm text-muted-foreground">
            No projects found in ~/.claude/projects/
          </div>
        )}
      </section>
    );
  }

  const favSlugs = new Set(favorites?.projects ?? []);

  const sorted = [...projects].sort((a, b) => {
    const aFav = favSlugs.has(a.slug) ? 1 : 0;
    const bFav = favSlugs.has(b.slug) ? 1 : 0;
    if (aFav !== bFav) return bFav - aFav;

    const aTmux = tmuxBySlug.has(a.slug) ? 1 : 0;
    const bTmux = tmuxBySlug.has(b.slug) ? 1 : 0;
    if (aTmux !== bTmux) return bTmux - aTmux;

    const aTime = a.lastActive ? new Date(a.lastActive).getTime() : 0;
    const bTime = b.lastActive ? new Date(b.lastActive).getTime() : 0;
    return bTime - aTime;
  });

  return (
    <section className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Projects</h2>
        <button
          onClick={() => setShowNewProject(!showNewProject)}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          {showNewProject ? "cancel" : "+ New Project"}
        </button>
      </div>
      {showNewProject && (
        <div className="mb-3">
          <NewProjectForm
            onCreated={(slug) => {
              setShowNewProject(false);
              queryClient.invalidateQueries({
                queryKey: orpc.projects.list.queryOptions().queryKey,
              });
              router.push(`/project/${slug}`);
            }}
          />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((project) => {
          const shortPath = project.path.split("/").slice(-2).join("/");
          const isFav = favSlugs.has(project.slug);
          const panes = tmuxBySlug.get(project.slug);
          return (
            <div key={project.slug} className="relative">
              <Link href={`/project/${project.slug}`}>
                <Card
                  size="sm"
                  className="cursor-pointer transition-colors hover:bg-accent/50"
                >
                  <CardHeader>
                    <CardTitle>{shortPath}</CardTitle>
                    <CardDescription className="truncate text-[11px]">
                      {project.path}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      {project.lastActive && (
                        <span>{getTimeAgo(project.lastActive)}</span>
                      )}
                      {project.lastCost != null && project.lastCost > 0 && (
                        <span className="tabular-nums">
                          ${project.lastCost.toFixed(2)}
                        </span>
                      )}
                      {(project.lastLinesAdded != null ||
                        project.lastLinesRemoved != null) && (
                        <span className="tabular-nums">
                          {project.lastLinesAdded
                            ? `+${project.lastLinesAdded}`
                            : ""}
                          {project.lastLinesRemoved
                            ? ` -${project.lastLinesRemoved}`
                            : ""}
                        </span>
                      )}
                      {project.lastModelUsage &&
                        (() => {
                          const primary = Object.entries(
                            project.lastModelUsage
                          ).sort((a, b) => b[1].costUSD - a[1].costUSD)[0];
                          return primary ? (
                            <span>
                              {primary[0]
                                .replace("claude-", "")
                                .split("-")
                                .slice(0, 2)
                                .join("-")}
                            </span>
                          ) : null;
                        })()}
                    </div>
                    {panes && panes.length > 0 && <TmuxInCard panes={panes} />}
                  </CardContent>
                </Card>
              </Link>
              <button
                onClick={() => toggleProject.mutate(project.slug)}
                className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                title={isFav ? "Remove from favorites" : "Add to favorites"}
              >
                {isFav ? (
                  <StarFilledIcon className="h-3.5 w-3.5 text-yellow-500" />
                ) : (
                  <StarIcon className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function DashboardPage() {
  return (
    <div>
      <UserConfigBar />
      <AutomationsSummary />
      <UnifiedProjectGrid />
    </div>
  );
}
