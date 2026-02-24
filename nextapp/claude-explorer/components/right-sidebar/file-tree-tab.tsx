"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

type ExpandedPaths = Set<string>;

function FileNode({
  slug,
  name,
  isDirectory,
  path,
  expandedPaths,
  onToggle,
  depth,
}: {
  slug: string;
  name: string;
  isDirectory: boolean;
  path: string;
  expandedPaths: ExpandedPaths;
  onToggle: (path: string) => void;
  depth: number;
}) {
  const isExpanded = expandedPaths.has(path);

  const { data: children } = useQuery({
    ...orpc.projects.files.queryOptions({ input: { slug, subpath: path } }),
    enabled: isDirectory && isExpanded,
    staleTime: 60_000,
  });

  return (
    <div>
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-1.5 py-0.5 pr-2 text-left text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          !isDirectory &&
            "text-muted-foreground hover:text-sidebar-accent-foreground"
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={() => isDirectory && onToggle(path)}
      >
        <span className="shrink-0 text-muted-foreground w-3 text-center leading-none">
          {isDirectory ? (isExpanded ? "▾" : "▸") : ""}
        </span>
        <span className="truncate">{name}</span>
      </button>

      {isDirectory && isExpanded && children && (
        <div>
          {children.map((entry) => (
            <FileNode
              key={entry.name}
              slug={slug}
              name={entry.name}
              isDirectory={entry.isDirectory}
              path={path ? `${path}/${entry.name}` : entry.name}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
          {children.length === 0 && (
            <div
              className="py-0.5 text-xs text-muted-foreground"
              style={{ paddingLeft: `${8 + (depth + 1) * 12}px` }}
            >
              Empty
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FileTreeTab({ slug }: { slug: string | null }) {
  const [expandedPaths, setExpandedPaths] = useState<ExpandedPaths>(new Set());

  const { data: rootEntries, isLoading } = useQuery({
    ...orpc.projects.files.queryOptions({ input: { slug: slug ?? "" } }),
    enabled: !!slug,
  });

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  if (!slug) {
    return (
      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
        Open a project to browse files
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground">
        Loading files…
      </div>
    );
  }

  if (!rootEntries || rootEntries.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground">
        No files found
      </div>
    );
  }

  return (
    <div className="py-1">
      {rootEntries.map((entry) => (
        <FileNode
          key={entry.name}
          slug={slug!}
          name={entry.name}
          isDirectory={entry.isDirectory}
          path={entry.name}
          expandedPaths={expandedPaths}
          onToggle={handleToggle}
          depth={0}
        />
      ))}
    </div>
  );
}
