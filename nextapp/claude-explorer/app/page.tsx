"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

import type { TmuxPane } from "@/lib/types";

import { CopyButton } from "@/components/copy-button";
import { PlusIcon, StarIcon, StarFilledIcon } from "@/components/icons";
import { ResumeSessionPopover } from "@/components/resume-session-popover";
import { StateBadgeInline } from "@/components/session-state-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PROJECT_TEMPLATES } from "@/lib/mcp-catalog";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { getTimeAgo } from "@/lib/utils";

/**
 * Finds the best-matching registered project slug for a given working directory.
 * Uses longest-prefix matching so that subdirectory paths (e.g. a monorepo
 * sub-package) correctly resolve to the parent project.
 */
function resolveProjectForPath(
  projectPath: string | null | undefined,
  projects: Array<{ slug: string; path: string }>,
  homeDir: string | undefined
): { slug: string; shortName: string } | null {
  if (!projectPath) return null;
  if (homeDir && projectPath === homeDir) return null;

  let best: { slug: string; path: string } | null = null;
  for (const p of projects) {
    if (
      projectPath.startsWith(p.path) &&
      (!best || p.path.length > best.path.length)
    ) {
      best = p;
    }
  }
  if (!best) return null;
  const shortName = best.path.split("/").pop() ?? best.slug;
  return { slug: best.slug, shortName };
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

function NewProjectForm({
  onCreated,
}: {
  onCreated: (slug: string, initialPrompt?: string) => void;
}) {
  const { data: serverConfig } = useQuery(orpc.server.config.queryOptions());
  const defaultParent = serverConfig
    ? `${serverConfig.homeDir}/projects`
    : "/home/bun/projects";
  const [name, setName] = useState("");
  const [initialPrompt, setInitialPrompt] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("blank");
  const [selectedMcps, setSelectedMcps] = useState<string[]>([]);

  // Clone-from-GitHub state
  const [cloneEnabled, setCloneEnabled] = useState(false);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState("");
  const [repoSearch, setRepoSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<{
    fullName: string;
    name: string;
    cloneUrl: string;
  } | null>(null);

  // Fetch GitHub integrations
  const { data: integrations } = useQuery(
    orpc.integrations.list.queryOptions()
  );
  const githubIntegrations = (integrations ?? []).filter(
    (i) => i.type === "github" && i.enabled
  );

  // Auto-select the only GitHub integration
  useEffect(() => {
    if (
      cloneEnabled &&
      githubIntegrations.length === 1 &&
      !selectedIntegrationId
    ) {
      setSelectedIntegrationId(githubIntegrations[0].id);
    }
  }, [cloneEnabled, githubIntegrations.length, selectedIntegrationId]);

  // Fetch repos when an integration is selected
  const {
    data: repos,
    isLoading: reposLoading,
    error: reposError,
  } = useQuery({
    ...orpc.integrations.githubListRepos.queryOptions({
      input: { integrationId: selectedIntegrationId },
    }),
    enabled: cloneEnabled && !!selectedIntegrationId,
  });

  const filteredRepos = (repos ?? []).filter(
    (r) =>
      !repoSearch || r.fullName.toLowerCase().includes(repoSearch.toLowerCase())
  );

  function applyTemplate(templateId: string) {
    setSelectedTemplate(templateId);
    const tpl = PROJECT_TEMPLATES.find((t) => t.id === templateId);
    if (tpl) {
      setSelectedMcps(tpl.mcpIds);
      if (tpl.initialPrompt && !initialPrompt) {
        setInitialPrompt(tpl.initialPrompt);
      }
    }
  }

  function handleToggleClone() {
    const next = !cloneEnabled;
    setCloneEnabled(next);
    if (!next) {
      setSelectedIntegrationId("");
      setSelectedRepo(null);
      setRepoSearch("");
    }
  }

  function handleSelectRepo(repo: NonNullable<typeof repos>[number]) {
    setSelectedRepo(repo);
    setName(repo.name);
  }

  const createProject = useMutation({
    mutationFn: () =>
      client.projects.create({
        parentDir: defaultParent,
        name,
        ...(initialPrompt ? { initialPrompt } : {}),
        ...(selectedMcps.length ? { mcps: selectedMcps } : {}),
        ...(cloneEnabled && selectedRepo && selectedIntegrationId
          ? {
              cloneUrl: selectedRepo.cloneUrl,
              cloneIntegrationId: selectedIntegrationId,
            }
          : {}),
      }),
    onSuccess: (result) => onCreated(result.slug, initialPrompt || undefined),
  });

  return (
    <div className="flex flex-col gap-2 rounded border p-3">
      {/* Template selector */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {PROJECT_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => applyTemplate(tpl.id)}
            className={`flex shrink-0 flex-col items-start gap-0.5 rounded border px-2.5 py-1.5 text-left transition-colors ${
              selectedTemplate === tpl.id
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            <span className="text-base leading-none">{tpl.emoji}</span>
            <span className="text-[11px] font-medium leading-tight">
              {tpl.name}
            </span>
            <span className="text-[10px] leading-tight opacity-70">
              {tpl.description}
            </span>
          </button>
        ))}
      </div>

      {/* Clone from GitHub toggle */}
      <button
        type="button"
        onClick={handleToggleClone}
        className={`self-start rounded border px-2.5 py-1 text-[11px] transition-colors ${
          cloneEnabled
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
        }`}
      >
        Clone from GitHub
      </button>

      {/* Clone panel */}
      {cloneEnabled && (
        <div className="flex flex-col gap-2 rounded border border-dashed p-2">
          {githubIntegrations.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No GitHub integrations configured. Add one in Settings.
            </p>
          ) : (
            <>
              {/* Integration selector — only shown when multiple accounts */}
              {githubIntegrations.length > 1 && (
                <select
                  className="rounded border bg-background px-2 py-1 text-xs"
                  value={selectedIntegrationId}
                  onChange={(e) => {
                    setSelectedIntegrationId(e.target.value);
                    setSelectedRepo(null);
                    setRepoSearch("");
                  }}
                >
                  <option value="">Select GitHub account…</option>
                  {githubIntegrations.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              )}

              {selectedIntegrationId && (
                <>
                  <Input
                    placeholder="Search repos…"
                    value={repoSearch}
                    onChange={(e) => setRepoSearch(e.target.value)}
                    className="text-xs"
                  />

                  {reposLoading && (
                    <p className="text-[11px] text-muted-foreground">
                      Loading repos…
                    </p>
                  )}

                  {reposError && (
                    <p className="text-[11px] text-destructive">
                      Failed to load repos.
                    </p>
                  )}

                  {!reposLoading && filteredRepos.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded border">
                      {filteredRepos.map((repo) => (
                        <button
                          key={repo.id}
                          type="button"
                          onClick={() => handleSelectRepo(repo)}
                          className={`flex w-full flex-col items-start px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-accent/50 ${
                            selectedRepo?.fullName === repo.fullName
                              ? "bg-primary/10"
                              : ""
                          }`}
                        >
                          <span className="font-medium">{repo.fullName}</span>
                          {repo.description && (
                            <span className="truncate text-[10px] text-muted-foreground">
                              {repo.description}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {repo.private ? "Private" : "Public"} ·{" "}
                            {repo.defaultBranch}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {!reposLoading &&
                    !reposError &&
                    filteredRepos.length === 0 &&
                    repoSearch && (
                      <p className="text-[11px] text-muted-foreground">
                        No repos match &ldquo;{repoSearch}&rdquo;.
                      </p>
                    )}

                  {selectedRepo && (
                    <p className="text-[10px] text-muted-foreground">
                      Will clone: {selectedRepo.fullName}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      <Input
        placeholder="Project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="text-xs"
        autoFocus
      />
      <p className="text-[10px] text-muted-foreground">
        Will be created in: {defaultParent}
      </p>
      <textarea
        placeholder="Initial prompt (optional)"
        value={initialPrompt}
        onChange={(e) => setInitialPrompt(e.target.value)}
        rows={2}
        className="rounded border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground"
      />
      {selectedMcps.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          MCPs to install: {selectedMcps.join(", ")}
        </p>
      )}
      <Button
        size="sm"
        disabled={
          !name || createProject.isPending || (cloneEnabled && !selectedRepo)
        }
        onClick={() => createProject.mutate()}
      >
        {createProject.isPending
          ? cloneEnabled
            ? "Cloning…"
            : "Creating…"
          : "Create"}
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
          <h2 className="text-sm font-medium text-muted-foreground">
            Projects
          </h2>
          <button
            onClick={() => setShowNewProject(!showNewProject)}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            {showNewProject ? "cancel" : "+ New Project"}
          </button>
        </div>
        {showNewProject && (
          <NewProjectForm
            onCreated={(slug, initialPrompt) => {
              void queryClient.invalidateQueries({
                queryKey: orpc.projects.list.queryOptions().queryKey,
              });
              router.push(
                initialPrompt
                  ? `/project/${slug}/chat?prompt=${encodeURIComponent(initialPrompt)}&_new=${Date.now()}`
                  : `/project/${slug}/chat?_new=${Date.now()}`
              );
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
            onCreated={(slug, initialPrompt) => {
              setShowNewProject(false);
              void queryClient.invalidateQueries({
                queryKey: orpc.projects.list.queryOptions().queryKey,
              });
              router.push(
                initialPrompt
                  ? `/project/${slug}/chat?prompt=${encodeURIComponent(initialPrompt)}&_new=${Date.now()}`
                  : `/project/${slug}/chat?_new=${Date.now()}`
              );
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

function UnifiedSessionsSection() {
  const queryClient = useQueryClient();

  const { data: liveSessions } = useQuery({
    ...orpc.liveState.active.queryOptions(),
    refetchInterval: 10000,
  });
  // Fetch ALL recent sessions across every project (not just root)
  const { data: recentSessions, isLoading } = useQuery({
    ...orpc.sessions.recent.queryOptions({ input: { limit: 50 } }),
    refetchInterval: 15000,
  });
  const { data: primary } = useQuery(orpc.root.primarySession.queryOptions());
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const { data: serverConfig } = useQuery(orpc.server.config.queryOptions());

  const setPrimary = useMutation({
    mutationFn: (sessionId: string | null) =>
      client.root.setPrimary({ sessionId }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orpc.root.primarySession.queryOptions().queryKey,
      }),
  });

  const homeDir = serverConfig?.homeDir;
  const primarySessionId = primary?.sessionId;

  // Build a set of live session IDs so we can deduplicate with recent sessions
  const liveIds = new Set(liveSessions?.map((s) => s.session_id) ?? []);

  // All recent sessions that aren't already shown in the live list
  const recentNotLive = recentSessions?.filter((s) => !liveIds.has(s.id)) ?? [];

  const hasAnything =
    (liveSessions && liveSessions.length > 0) || recentNotLive.length > 0;

  if (!isLoading && !hasAnything) {
    return (
      <section className="px-4 pb-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Recent Conversations
          </h2>
          <Link href="/chat">
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-2 text-xs"
            >
              <PlusIcon className="h-3 w-3" />
              New Convo
            </Button>
          </Link>
        </div>
        <div className="rounded border border-dashed p-4">
          <p className="mb-1 text-sm font-medium">Welcome to Claude Explorer</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Start your first conversation to set up your workspace. Claude runs
            from your home directory and can create projects, manage files, and
            help you build.
          </p>
          <Link href="/chat?onboard=1">
            <Button size="sm">Start Conversation</Button>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 pb-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Recent Conversations
        </h2>
        <Link href="/chat">
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 px-2 text-xs"
          >
            <PlusIcon className="h-3 w-3" />
            New Convo
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-1">
        {/* Active (live) sessions — across all projects */}
        {liveSessions?.map((s) => {
          const resolved = resolveProjectForPath(
            s.project_path,
            projects ?? [],
            homeDir
          );
          const sessionHref = resolved
            ? `/project/${resolved.slug}/chat/${s.session_id}`
            : `/chat/${s.session_id}`;
          const isPrimary = s.session_id === primarySessionId;

          return (
            <ResumeSessionPopover key={s.session_id} session={s}>
              <div className="flex cursor-pointer items-center gap-2 rounded border px-3 py-1.5 transition-colors hover:bg-accent/50">
                <StateBadgeInline
                  state={s.state}
                  currentTool={s.current_tool}
                  compact
                />
                <Link
                  href={sessionHref}
                  className="min-w-0 flex-1 truncate text-xs hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {s.first_prompt ?? "Session starting..."}
                </Link>
                {resolved ? (
                  <Link
                    href={`/project/${resolved.slug}`}
                    className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {resolved.shortName}
                  </Link>
                ) : (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    root
                  </span>
                )}
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {getTimeAgo(s.updated_at)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 shrink-0 px-1.5 text-[10px]"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPrimary.mutate(isPrimary ? null : s.session_id);
                  }}
                  title={isPrimary ? "Unpin primary session" : "Pin as primary"}
                >
                  {isPrimary ? "unpin" : "pin"}
                </Button>
              </div>
            </ResumeSessionPopover>
          );
        })}

        {/* All recent sessions (all projects) that are not currently live */}
        {recentNotLive.map((session) => {
          const isPrimary = session.id === primarySessionId;
          const sessionHref = session.projectSlug
            ? `/project/${session.projectSlug}/chat/${session.id}`
            : `/chat/${session.id}`;
          const projectLabel = session.projectSlug
            ? (session.projectPath.split("/").pop() ?? session.projectSlug)
            : "root";

          return (
            <div
              key={session.id}
              className="flex items-center gap-2 rounded border px-3 py-1.5 transition-colors hover:bg-accent/50"
            >
              {session.sessionState && (
                <StateBadgeInline state={session.sessionState} compact />
              )}
              <Link
                href={sessionHref}
                className="min-w-0 flex-1 truncate text-xs hover:underline"
              >
                {session.firstPrompt}
              </Link>
              {session.projectSlug ? (
                <Link
                  href={`/project/${session.projectSlug}`}
                  className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  {projectLabel}
                </Link>
              ) : (
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  root
                </span>
              )}
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {getTimeAgo(session.lastModified)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 shrink-0 px-1.5 text-[10px]"
                onClick={() => setPrimary.mutate(isPrimary ? null : session.id)}
                title={isPrimary ? "Unpin primary session" : "Pin as primary"}
              >
                {isPrimary ? "unpin" : "pin"}
              </Button>
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
      <UnifiedProjectGrid />
      <UnifiedSessionsSection />
    </div>
  );
}
