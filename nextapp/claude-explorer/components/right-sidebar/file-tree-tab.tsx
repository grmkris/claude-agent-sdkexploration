"use client";

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { getFileIcon, isBinaryFile } from "@/components/right-sidebar/file-type-icon";
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
  selectedFile,
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
  selectedFile: string | null;
  depth: number;
  filter: string;
}) {
  const isExpanded = expandedPaths.has(path);
  const isSelected = !isDirectory && selectedFile === path;
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
          isSelected && "bg-sidebar-accent text-sidebar-accent-foreground",
          !isDirectory && !isSelected && "text-muted-foreground hover:text-sidebar-accent-foreground"
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
              selectedFile={selectedFile}
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

function FilePreview({
  slug,
  path,
  onClose,
}: {
  slug: string;
  path: string;
  onClose: () => void;
}) {
  const fileName = path.split("/").at(-1) ?? path;
  const binary = isBinaryFile(fileName);

  const { data, isLoading, error } = useQuery({
    ...orpc.projects.readFile.queryOptions({ input: { slug, path } }),
    enabled: !binary,
    staleTime: 30_000,
  });

  const lines = data?.content.split("\n").slice(0, 60) ?? [];
  const truncated = data && data.content.split("\n").length > 60;

  return (
    <div className="border-t border-sidebar-border bg-sidebar-accent/20 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-sidebar-border/50">
        <code className="text-[10px] font-mono text-muted-foreground truncate flex-1">
          {fileName}
        </code>
        <button
          onClick={onClose}
          className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Close preview"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="max-h-52 overflow-auto">
        {binary && (
          <p className="px-3 py-3 text-[11px] text-muted-foreground italic">
            Binary file — preview not available
          </p>
        )}
        {!binary && isLoading && (
          <p className="px-3 py-3 text-[11px] text-muted-foreground animate-pulse">
            Loading…
          </p>
        )}
        {!binary && error && (
          <p className="px-3 py-3 text-[11px] text-destructive">
            {error.message || "Failed to load"}
          </p>
        )}
        {!binary && data && (
          <pre className="px-3 py-2 text-[10px] font-mono leading-relaxed text-foreground/75 whitespace-pre-wrap break-all">
            {lines.join("\n")}
            {truncated && "\n…(first 60 lines)"}
          </pre>
        )}
      </div>
    </div>
  );
}

export function FileTreeTab({ slug }: { slug: string | null }) {
  const [expandedPaths, setExpandedPaths] = useState<ExpandedPaths>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
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

  const handleFileClick = useCallback((path: string) => {
    setSelectedFile((prev) => (prev === path ? null : path));
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
            selectedFile={selectedFile}
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

      {/* Inline file preview */}
      {selectedFile && slug && (
        <FilePreview
          slug={slug}
          path={selectedFile}
          onClose={() => setSelectedFile(null)}
        />
      )}
    </div>
  );
}
