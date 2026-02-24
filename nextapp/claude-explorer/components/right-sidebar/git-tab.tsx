"use client";

import { useQuery } from "@tanstack/react-query";
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

  const { data: gitStatus, isLoading } = useQuery({
    ...orpc.projects.gitStatus.queryOptions({
      input: { slug: slug ?? "" },
    }),
    enabled: !!slug,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
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

  return (
    <div className="flex flex-col">
      {/* Branch + summary */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-xs font-medium text-foreground">
          {gitStatus.branch}
        </span>
        {gitStatus.changes.length > 0 ? (
          <span className="ml-auto text-[10px] text-yellow-400">
            {gitStatus.changes.length} change
            {gitStatus.changes.length !== 1 ? "s" : ""}
          </span>
        ) : (
          <span className="ml-auto text-[10px] text-green-400">clean</span>
        )}
      </div>

      {/* File list */}
      {gitStatus.changes.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          No uncommitted changes
        </div>
      ) : (
        <div>
          {gitStatus.changes.map(({ path, status }) => (
            <div key={path}>
              <button
                type="button"
                onClick={() => handleFileClick(path)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                {statusBadge(status)}
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                  {path}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {expandedFile === path ? "▾" : "▸"}
                </span>
              </button>

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
