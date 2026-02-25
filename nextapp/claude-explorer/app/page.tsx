"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { TmuxPane } from "@/lib/types";

import { CopyButton } from "@/components/copy-button";
import { StarIcon, StarFilledIcon } from "@/components/icons";
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
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { getTimeAgo } from "@/lib/utils";

function RootWorkspaceSection() {
  const queryClient = useQueryClient();

  const { data: primary } = useQuery(orpc.root.primarySession.queryOptions());
  const { data: sessions, isLoading } = useQuery({
    ...orpc.root.sessions.queryOptions({ input: {} }),
    refetchInterval: 15000,
  });

  const setPrimary = useMutation({
    mutationFn: (sessionId: string | null) =>
      client.root.setPrimary({ sessionId }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orpc.root.primarySession.queryOptions().queryKey,
      }),
  });

  const primarySessionId = primary?.sessionId;
  const primarySession = sessions?.find((s) => s.id === primarySessionId);
  const otherSessions =
    sessions?.filter((s) => s.id !== primarySessionId) ?? [];

  if (!isLoading && (!sessions || sessions.length === 0) && !primarySession) {
    return (
      <section className="px-4 pb-2">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Root Workspace
        </h2>
        <div className="rounded border border-dashed p-4">
          <p className="mb-1 text-sm font-medium">Welcome to Claude Explorer</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Start your first conversation to set up your workspace. Claude runs
            from ~/home and can create projects, manage files, and help you
            build.
          </p>
          <Link href="/chat?onboard=1">
            <Button size="sm">Start Conversation</Button>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 pb-2">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">
        Root Workspace
      </h2>

      {/* Primary session card */}
      <div className="mb-3 rounded border p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Primary Session
          </span>
          {primarySession?.sessionState === "active" && (
            <StateBadgeInline state="thinking" compact />
          )}
        </div>

        {primarySession ? (
          <div className="flex flex-col gap-1.5">
            <p className="truncate text-sm">{primarySession.firstPrompt}</p>
            <p className="text-[10px] text-muted-foreground">
              Last modified:{" "}
              {new Date(primarySession.lastModified).toLocaleString()}
            </p>
            <div className="flex gap-2">
              <Link href={`/chat/${primarySession.id}`}>
                <Button size="sm">Continue</Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPrimary.mutate(null)}
              >
                Unpin
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">
              No primary session set. Start one or pin an existing session.
            </p>
            <Link href="/chat">
              <Button size="sm">Start Primary Session</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Session list */}
      {(isLoading || otherSessions.length > 0) && (
        <div>
          <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">
            Sessions
          </h3>
          {isLoading && (
            <div className="py-2 text-center text-xs text-muted-foreground animate-pulse">
              Loading...
            </div>
          )}
          <div className="flex flex-col gap-1">
            {otherSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-2 rounded border px-3 py-1.5"
              >
                {session.sessionState === "active" && (
                  <StateBadgeInline state="thinking" compact />
                )}
                <Link
                  href={`/chat/${session.id}`}
                  className="min-w-0 flex-1 truncate text-xs hover:underline"
                >
                  {session.firstPrompt}
                </Link>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {new Date(session.lastModified).toLocaleDateString()}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setPrimary.mutate(session.id)}
                >
                  Pin
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
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
  const { data: serverConfig } = useQuery(orpc.server.config.queryOptions());
  const defaultParent = serverConfig
    ? `${serverConfig.homeDir}/projects`
    : "/home/bun/projects";
  const [parentDir, setParentDir] = useState("");
  const [name, setName] = useState("");
  const [initialPrompt, setInitialPrompt] = useState("");

  const effectiveParent = parentDir || defaultParent;
  const isValidParent = effectiveParent.startsWith("/");

  const createProject = useMutation({
    mutationFn: () =>
      client.projects.create({
        parentDir: effectiveParent,
        name,
        ...(initialPrompt ? { initialPrompt } : {}),
      }),
    onSuccess: (result) => onCreated(result.slug),
  });

  return (
    <div className="flex flex-col gap-2 rounded border p-3">
      <div>
        <Input
          placeholder={defaultParent}
          value={parentDir}
          onChange={(e) => setParentDir(e.target.value)}
          className="text-xs"
        />
        {parentDir && !isValidParent && (
          <span className="text-[10px] text-destructive">
            Must be an absolute path (starts with /)
          </span>
        )}
      </div>
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
        disabled={
          !effectiveParent || !name || !isValidParent || createProject.isPending
        }
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
            onCreated={(slug) => {
              void queryClient.invalidateQueries({
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
              void queryClient.invalidateQueries({
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

function ActiveSessionsSection() {
  const { data: sessions } = useQuery({
    ...orpc.liveState.active.queryOptions(),
    refetchInterval: 10000,
  });

  if (!sessions || sessions.length === 0) return null;

  return (
    <section className="px-4 pb-2">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">
        Active Sessions
      </h2>
      <div className="flex flex-col gap-1">
        {sessions.map((s) => (
          <Link
            key={s.session_id}
            href={`/chat/${s.session_id}`}
            className="flex items-center gap-2 rounded border px-3 py-1.5 hover:bg-accent/50 transition-colors"
          >
            <StateBadgeInline
              state={s.state}
              currentTool={s.current_tool}
              compact
            />
            <span className="min-w-0 flex-1 truncate text-xs">
              {s.first_prompt ?? "Session starting..."}
            </span>
            {s.project_path && (
              <span className="shrink-0 truncate max-w-[140px] text-[10px] text-muted-foreground">
                {s.project_path.split("/").slice(-2).join("/")}
              </span>
            )}
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {getTimeAgo(s.updated_at)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function DashboardPage() {
  return (
    <div>
      <ActiveSessionsSection />
      <RootWorkspaceSection />
      <UnifiedProjectGrid />
    </div>
  );
}
