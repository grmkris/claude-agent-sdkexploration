"use client";

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { getFileIcon } from "@/components/right-sidebar/file-type-icon";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

type ExpandedPaths = Set<string>;

function formatSize(bytes: number): string {
  if (bytes === 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / 1024 / 1024).toFixed(1)}M`;
}

function FileNode({
  slug,
  name,
  isDirectory,
  path,
  size,
  expandedPaths,
  onToggle,
  onFileClick,
  depth,
  filter,
}: {
  slug: string;
  name: string;
  isDirectory: boolean;
  path: string;
  size?: number;
  expandedPaths: ExpandedPaths;
  onToggle: (path: string) => void;
  onFileClick: (path: string) => void;
  depth: number;
  filter: string;
}) {
  const isExpanded = expandedPaths.has(path);
  const { icon, colorClass }: { icon: IconSvgElement; colorClass: string } =
    getFileIcon(name, isDirectory, isExpanded);

  const { data: children } = useQuery({
    ...orpc.projects.files.queryOptions({ input: { slug, subpath: path } }),
    enabled: isDirectory && isExpanded,
    staleTime: 60_000,
  });

  const filteredChildren = filter
    ? children?.filter((c) =>
        c.name.toLowerCase().includes(filter.toLowerCase())
      )
    : children;

  const handleClick = () => {
    if (isDirectory) {
      onToggle(path);
    } else {
      onFileClick(path);
    }
  };

  return (
    <div>
      <button
        type="button"
        className={cn(
          "group flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          !isDirectory &&
            "text-muted-foreground hover:text-sidebar-accent-foreground"
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={handleClick}
      >
        <HugeiconsIcon
          icon={icon}
          size={13}
          strokeWidth={1.5}
          className={cn("shrink-0", colorClass)}
        />
        <span className="flex-1 truncate">{name}</span>
        {!isDirectory && size != null && size > 0 && (
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity">
            {formatSize(size)}
          </span>
        )}
      </button>

      {isDirectory && isExpanded && (
        <div>
          {filteredChildren?.map((entry) => (
            <FileNode
              key={entry.name}
              slug={slug}
              name={entry.name}
              isDirectory={entry.isDirectory}
              path={path ? `${path}/${entry.name}` : entry.name}
              size={entry.size}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              onFileClick={onFileClick}
              depth={depth + 1}
              filter={filter}
            />
          ))}
          {filteredChildren?.length === 0 && (
            <div
              className="py-0.5 text-xs text-muted-foreground"
              style={{ paddingLeft: `${8 + (depth + 1) * 12}px` }}
            >
              {filter ? "No matches" : "Empty"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FileTreeTab({ slug }: { slug: string | null }) {
  const router = useRouter();
  const [expandedPaths, setExpandedPaths] = useState<ExpandedPaths>(new Set());
  const [filter, setFilter] = useState("");

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

  const handleFileClick = useCallback(
    (path: string) => {
      if (slug) {
        router.push(`/project/${slug}/file/${path}`);
      }
    },
    [slug, router]
  );

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

  const filteredRoot = filter
    ? rootEntries?.filter((e) =>
        e.name.toLowerCase().includes(filter.toLowerCase())
      )
    : rootEntries;

  if (!rootEntries || rootEntries.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground">
        No files found
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filter input */}
      <div className="px-2 py-1.5 border-b border-sidebar-border">
        <input
          type="text"
          placeholder="Filter files…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full rounded bg-sidebar-accent/40 px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:bg-sidebar-accent/70 transition-colors"
        />
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {filteredRoot?.map((entry) => (
          <FileNode
            key={entry.name}
            slug={slug}
            name={entry.name}
            isDirectory={entry.isDirectory}
            path={entry.name}
            size={entry.size}
            expandedPaths={expandedPaths}
            onToggle={handleToggle}
            onFileClick={handleFileClick}
            depth={0}
            filter={filter}
          />
        ))}
        {filteredRoot?.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No files match "{filter}"
          </div>
        )}
      </div>
    </div>
  );
}
