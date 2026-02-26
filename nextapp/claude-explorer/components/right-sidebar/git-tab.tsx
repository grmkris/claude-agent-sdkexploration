"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { cn } from "@/lib/utils";

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

export function GitTab({ slug }: { slug: string | null }) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<Record<string, string>>({});
  const [loadingDiff, setLoadingDiff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const queryClient = useQueryClient();

  const { data: gitStatus, isLoading } = useQuery({
    ...orpc.projects.gitStatus.queryOptions({
      input: { slug: slug ?? "" },
    }),
    enabled: !!slug,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const invalidateGit = () => {
    void queryClient.invalidateQueries({
      queryKey: orpc.projects.gitStatus.queryOptions({
        input: { slug: slug ?? "" },
      }).queryKey,
    });
    setDiffs({});
    setExpandedFile(null);
  };

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
      {/* Combined action bar: branch · changes · Pull · Stage All · Commit · Commit+Push */}
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

      {/* File list */}
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
                  <svg
                    width="12"
                    height="12"
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
    </div>
  );
}
