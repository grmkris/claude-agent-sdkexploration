"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { cn } from "@/lib/utils";

// --- Types ---

type CommitFile = { path: string; additions: number; deletions: number };

// --- Helpers ---

function statusBadge(status: string) {
  if (status === "??")
    return (
      <span className="shrink-0 text-[10px] font-bold text-green-400">U</span>
    );
  if (status === "A")
    return (
      <span className="shrink-0 text-[10px] font-bold text-green-400">A</span>
    );
  if (status.includes("D"))
    return (
      <span className="shrink-0 text-[10px] font-bold text-red-400">D</span>
    );
  if (status === "UU" || status === "AA" || status === "DD")
    return (
      <span className="shrink-0 text-[10px] font-bold text-red-400">C</span>
    );
  return (
    <span className="shrink-0 text-[10px] font-bold text-yellow-400">M</span>
  );
}

function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="overflow-x-auto whitespace-pre text-[10px] leading-relaxed">
      {diff.split("\n").map((line, i) => (
        <span
          key={i}
          className={cn(
            "block",
            line.startsWith("+") &&
              !line.startsWith("+++") &&
              "text-green-400 bg-green-400/10",
            line.startsWith("-") &&
              !line.startsWith("---") &&
              "text-red-400 bg-red-400/10",
            line.startsWith("@@") && "text-blue-400",
            !line.startsWith("+") &&
              !line.startsWith("-") &&
              !line.startsWith("@@") &&
              "text-muted-foreground"
          )}
        >
          {line || " "}
        </span>
      ))}
    </pre>
  );
}

function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const LINEAR_ISSUE_RE = /\b([A-Z]{2,5}-\d+)\b/g;

function linkifyLinear(text: string): React.ReactNode[] {
  const parts = text.split(LINEAR_ISSUE_RE);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={`https://linear.app/issue/${part}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

// External link icon (reused)
function ExternalLinkIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

// --- Main Component ---

export function GitTab({ slug }: { slug: string | null }) {
  const [view, setView] = useState<"changes" | "history">("changes");

  // Changes view state
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<Record<string, string>>({});
  const [loadingDiff, setLoadingDiff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // History view state
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [commitFiles, setCommitFiles] = useState<Record<string, CommitFile[]>>(
    {}
  );
  const [loadingCommitFiles, setLoadingCommitFiles] = useState<string | null>(
    null
  );
  const [expandedCommitFile, setExpandedCommitFile] = useState<string | null>(
    null
  ); // "hash:path"
  const [commitFileDiffs, setCommitFileDiffs] = useState<
    Record<string, string>
  >({});
  const [loadingCommitFileDiff, setLoadingCommitFileDiff] = useState<
    string | null
  >(null);

  const router = useRouter();
  const queryClient = useQueryClient();

  // --- Data: git status (always loaded) ---
  const { data: gitStatus, isLoading } = useQuery({
    ...orpc.projects.gitStatus.queryOptions({
      input: { slug: slug ?? "" },
    }),
    enabled: !!slug,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  // --- Data: git log (history tab only) ---
  const { data: gitLogData, isLoading: isLogLoading } = useQuery({
    ...orpc.projects.gitLog.queryOptions({
      input: { slug: slug ?? "", limit: 20 },
    }),
    enabled: !!slug && view === "history",
    staleTime: 30_000,
  });

  // --- Data: integrations (for Railway/GitHub cross-linking) ---
  const { data: integrations } = useQuery({
    ...orpc.integrations.list.queryOptions(),
    enabled: !!slug && view === "history",
    staleTime: 60_000,
  });

  const railwayIntegration = useMemo(
    () =>
      integrations?.find(
        (i) => i.projectSlug === slug && i.type === "railway" && i.enabled
      ),
    [integrations, slug]
  );

  const { data: railwayData } = useQuery({
    ...orpc.integrations.data.queryOptions({
      input: { id: railwayIntegration?.id ?? "" },
    }),
    enabled: !!railwayIntegration,
    staleTime: 60_000,
  });

  // Build map: shortHash → deploy info
  const railwayDeployByHash = useMemo(() => {
    const map = new Map<
      string,
      { status: string; statusColor: string; url?: string }
    >();
    const deployWidget = railwayData?.widgets.find(
      (w) => w.id === "railway-deploys"
    );
    for (const item of deployWidget?.items ?? []) {
      if (item.secondaryLabel) {
        map.set(item.secondaryLabel, {
          status: item.status ?? "",
          statusColor: item.statusColor ?? "#6b7280",
          url: item.url ?? undefined,
        });
      }
    }
    return map;
  }, [railwayData]);

  // GitHub integration → commit link base URL
  const githubIntegration = useMemo(
    () =>
      integrations?.find(
        (i) => i.projectSlug === slug && i.type === "github" && i.enabled
      ),
    [integrations, slug]
  );

  const githubRepoUrl = useMemo(() => {
    const url = githubIntegration?.config?.gitRemoteUrl as string | undefined;
    if (!url) return null;
    const match = url.match(/github\.com[:/]([^/]+\/[^/.]+)/);
    return match ? `https://github.com/${match[1]}` : null;
  }, [githubIntegration]);

  // --- Invalidation helper ---
  const invalidateGit = () => {
    void queryClient.invalidateQueries({
      queryKey: orpc.projects.gitStatus.queryOptions({
        input: { slug: slug ?? "" },
      }).queryKey,
    });
    setDiffs({});
    setExpandedFile(null);
  };

  // --- Mutations ---
  const pullMutation = useMutation({
    mutationFn: () => client.projects.gitPull({ slug: slug! }),
    onSuccess: (data) => {
      if (!data.success) setError(data.output);
      else setError(null);
      invalidateGit();
    },
    onError: (e) => setError(String(e)),
  });

  const stageAllMutation = useMutation({
    mutationFn: () => client.projects.gitStageAll({ slug: slug! }),
    onSuccess: (data) => {
      if (!data.success) setError(data.output);
      else setError(null);
      invalidateGit();
    },
    onError: (e) => setError(String(e)),
  });

  // --- Handlers: changes view ---
  const handleFileClick = async (filePath: string) => {
    if (expandedFile === filePath) {
      setExpandedFile(null);
      return;
    }
    setExpandedFile(filePath);
    if (diffs[filePath] !== undefined) return;
    setLoadingDiff(filePath);
    try {
      const result = await client.projects.gitDiff({
        slug: slug!,
        path: filePath,
      });
      setDiffs((prev) => ({
        ...prev,
        [filePath]: result?.diff ?? "(no diff)",
      }));
    } catch {
      setDiffs((prev) => ({ ...prev, [filePath]: "(failed to load diff)" }));
    } finally {
      setLoadingDiff(null);
    }
  };

  // --- Handlers: history view ---
  const handleCommitClick = async (hash: string) => {
    if (expandedCommit === hash) {
      setExpandedCommit(null);
      return;
    }
    setExpandedCommit(hash);
    setExpandedCommitFile(null);
    if (commitFiles[hash] !== undefined) return;
    setLoadingCommitFiles(hash);
    try {
      const result = await client.projects.gitCommitFiles({
        slug: slug!,
        hash,
      });
      setCommitFiles((prev) => ({ ...prev, [hash]: result.files }));
    } catch {
      setCommitFiles((prev) => ({ ...prev, [hash]: [] }));
    } finally {
      setLoadingCommitFiles(null);
    }
  };

  const handleCommitFileClick = async (hash: string, filePath: string) => {
    const key = `${hash}:${filePath}`;
    if (expandedCommitFile === key) {
      setExpandedCommitFile(null);
      return;
    }
    setExpandedCommitFile(key);
    if (commitFileDiffs[key] !== undefined) return;
    setLoadingCommitFileDiff(key);
    try {
      const result = await client.projects.gitCommitDiff({
        slug: slug!,
        hash,
        path: filePath,
      });
      setCommitFileDiffs((prev) => ({ ...prev, [key]: result.diff }));
    } catch {
      setCommitFileDiffs((prev) => ({
        ...prev,
        [key]: "(failed to load diff)",
      }));
    } finally {
      setLoadingCommitFileDiff(null);
    }
  };

  // --- Early returns ---
  const isBusy = pullMutation.isPending || stageAllMutation.isPending;

  if (!slug) {
    return (
      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
        Open a project to see git status
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground">
        Loading git status…
      </div>
    );
  }

  if (!gitStatus?.isRepo) {
    return (
      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
        Not a git repository
      </div>
    );
  }

  const hasConflicts = gitStatus.changes.some((c) =>
    ["UU", "AA", "DD"].includes(c.status)
  );
  const hasChanges = gitStatus.changes.length > 0;

  return (
    <div className="flex flex-col">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
        <span className="text-xs font-medium text-foreground">
          {gitStatus.branch}
        </span>
        {hasChanges ? (
          <span className="text-[10px] text-yellow-400">
            {gitStatus.changes.length} change
            {gitStatus.changes.length !== 1 ? "s" : ""}
          </span>
        ) : (
          <span className="text-[10px] text-green-400">clean</span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => pullMutation.mutate()}
            className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-muted/80 disabled:opacity-50"
          >
            {pullMutation.isPending ? "Pulling…" : "Pull"}
          </button>
          <button
            type="button"
            disabled={isBusy || !hasChanges}
            onClick={() => stageAllMutation.mutate()}
            className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-muted/80 disabled:opacity-50"
          >
            {stageAllMutation.isPending ? "Staging…" : "Stage All"}
          </button>
          {hasChanges && !hasConflicts && (
            <>
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  router.push(
                    `/project/${slug}/chat?prompt=${encodeURIComponent("Stage all changes and commit with a good conventional commit message.")}`
                  )
                }
                className="rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                ✦ Commit
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  router.push(
                    `/project/${slug}/chat?prompt=${encodeURIComponent("Stage all changes, commit with a good conventional commit message, then push to remote.")}`
                  )
                }
                className="rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                ✦ Commit + Push
              </button>
            </>
          )}
          {hasConflicts && (
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/project/${slug}/chat?prompt=${encodeURIComponent("Resolve the merge conflicts in this project. Check git status, read the conflicted files, fix them, and stage the resolved files.")}`
                )
              }
              className="rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-500/30"
            >
              Resolve conflicts
            </button>
          )}
        </div>
      </div>

      {/* Changes / History tab switcher */}
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setView("changes")}
          className={cn(
            "px-3 py-1.5 text-[11px] font-medium transition-colors",
            view === "changes"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Changes
          {hasChanges && (
            <span className="ml-1 text-[10px] text-yellow-400">
              ({gitStatus.changes.length})
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setView("history")}
          className={cn(
            "px-3 py-1.5 text-[11px] font-medium transition-colors",
            view === "history"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          History
        </button>
      </div>

      {/* Error feedback */}
      {error && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-3 py-2">
          <pre className="whitespace-pre-wrap text-[10px] text-red-400">
            {error}
          </pre>
          <button
            type="button"
            onClick={() => setError(null)}
            className="mt-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            dismiss
          </button>
        </div>
      )}

      {/* ── Changes view ── */}
      {view === "changes" && (
        <>
          {gitStatus.changes.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No uncommitted changes
            </div>
          ) : (
            <div>
              {gitStatus.changes.map(({ path, status }) => (
                <div key={path}>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => handleFileClick(path)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    >
                      {statusBadge(status)}
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                        {path}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {expandedFile === path ? "▾" : "▸"}
                      </span>
                    </button>
                    <Link
                      href={`/project/${slug}/diff/${path}`}
                      className="shrink-0 px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
                      title="Open full diff"
                    >
                      <ExternalLinkIcon />
                    </Link>
                  </div>

                  {expandedFile === path && (
                    <div className="border-t border-b border-sidebar-border bg-muted/20 px-2 py-1.5">
                      {loadingDiff === path ? (
                        <p className="text-[11px] text-muted-foreground">
                          Loading diff…
                        </p>
                      ) : (
                        <DiffView diff={diffs[path] ?? ""} />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── History view ── */}
      {view === "history" && (
        <div>
          {isLogLoading ? (
            <div className="px-3 py-4 text-xs text-muted-foreground">
              Loading history…
            </div>
          ) : !gitLogData || gitLogData.commits.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No commits found
            </div>
          ) : (
            gitLogData.commits.map((commit) => {
              const railwayDeploy = railwayDeployByHash.get(commit.shortHash);
              const isExpanded = expandedCommit === commit.hash;
              const files = commitFiles[commit.hash];

              return (
                <div
                  key={commit.hash}
                  className="border-b border-sidebar-border last:border-0"
                >
                  {/* Commit row */}
                  <div className="flex items-start">
                    <button
                      type="button"
                      onClick={() => handleCommitClick(commit.hash)}
                      className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-sidebar-accent"
                    >
                      <span className="mt-0.5 shrink-0 text-[10px] text-muted-foreground">
                        {isExpanded ? "▾" : "▸"}
                      </span>
                      <div className="min-w-0 flex-1">
                        {/* Hash + Railway badge row */}
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                            {commit.shortHash}
                          </span>
                          {railwayDeploy && (
                            <a
                              href={railwayDeploy.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`Railway: ${railwayDeploy.status}`}
                              className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium"
                              style={{
                                backgroundColor:
                                  railwayDeploy.statusColor + "33",
                                color: railwayDeploy.statusColor,
                              }}
                            >
                              🚂 {railwayDeploy.status}
                            </a>
                          )}
                        </div>
                        {/* Subject */}
                        <div className="mt-0.5 text-[11px] text-foreground leading-snug">
                          {linkifyLinear(commit.subject)}
                        </div>
                        {/* Author + time */}
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {commit.author} · {relativeTime(commit.date)}
                        </div>
                      </div>
                    </button>

                    {/* GitHub link */}
                    {githubRepoUrl && (
                      <a
                        href={`${githubRepoUrl}/commit/${commit.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 px-2 py-2 text-muted-foreground transition-colors hover:text-foreground"
                        title="View on GitHub"
                      >
                        <ExternalLinkIcon />
                      </a>
                    )}
                  </div>

                  {/* Expanded commit detail */}
                  {isExpanded && (
                    <div className="border-t border-sidebar-border bg-muted/10">
                      {/* Commit body */}
                      {commit.body && (
                        <div className="border-b border-sidebar-border px-3 py-2 text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
                          {linkifyLinear(commit.body)}
                        </div>
                      )}

                      {/* Files changed */}
                      {loadingCommitFiles === commit.hash ? (
                        <div className="px-3 py-2 text-[11px] text-muted-foreground">
                          Loading files…
                        </div>
                      ) : files ? (
                        files.length === 0 ? (
                          <div className="px-3 py-2 text-[11px] text-muted-foreground">
                            No files changed
                          </div>
                        ) : (
                          <div>
                            {files.map((file) => {
                              const fileKey = `${commit.hash}:${file.path}`;
                              const isFileExpanded =
                                expandedCommitFile === fileKey;
                              return (
                                <div key={file.path}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCommitFileClick(
                                        commit.hash,
                                        file.path
                                      )
                                    }
                                    className="flex w-full items-center gap-2 px-3 py-1 text-left transition-colors hover:bg-sidebar-accent"
                                  >
                                    <span className="shrink-0 font-mono text-[10px] text-green-400">
                                      +{file.additions}
                                    </span>
                                    <span className="shrink-0 font-mono text-[10px] text-red-400">
                                      -{file.deletions}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                                      {file.path}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-muted-foreground">
                                      {isFileExpanded ? "▾" : "▸"}
                                    </span>
                                  </button>

                                  {isFileExpanded && (
                                    <div className="border-t border-sidebar-border bg-muted/30 px-2 py-1.5">
                                      {loadingCommitFileDiff === fileKey ? (
                                        <p className="text-[11px] text-muted-foreground">
                                          Loading diff…
                                        </p>
                                      ) : (
                                        <DiffView
                                          diff={commitFileDiffs[fileKey] ?? ""}
                                        />
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
