"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { orpc } from "@/lib/orpc";

export function FilePreviewPopover({
  filePath,
  projectSlug,
  children,
}: {
  filePath: string;
  projectSlug: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const { data: resolved } = useQuery({
    ...orpc.projects.resolveSlug.queryOptions({ input: { slug: projectSlug } }),
    enabled: open,
    staleTime: Infinity,
  });

  const relativePath = resolved?.path
    ? filePath.startsWith(resolved.path)
      ? filePath.slice(resolved.path.length).replace(/^\//, "")
      : filePath
    : null;

  const { data, isLoading, error } = useQuery({
    ...orpc.projects.readFile.queryOptions({
      input: { slug: projectSlug, path: relativePath ?? "" },
    }),
    enabled: open && relativePath !== null,
    staleTime: 30_000,
  });

  const lines = data?.content.split("\n").slice(0, 50) ?? [];
  const truncated = data && data.content.split("\n").length > 50;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="cursor-pointer hover:underline decoration-dotted underline-offset-2"
        render={(props) => <span {...props}>{children}</span>}
      />
      <PopoverContent side="bottom" align="start" className="w-[480px] p-0">
        <div className="flex items-center justify-between border-b border-border/50 px-3 py-1.5">
          <code className="truncate text-[11px] font-mono text-muted-foreground">
            {relativePath ?? filePath}
          </code>
          <Link
            href={`/project/${projectSlug}?file=${encodeURIComponent(relativePath ?? filePath)}`}
            className="shrink-0 text-[10px] text-primary hover:underline ml-2"
            onClick={() => setOpen(false)}
          >
            Open in explorer
          </Link>
        </div>
        <div className="max-h-72 overflow-auto">
          {isLoading && (
            <div className="px-3 py-4 text-[11px] text-muted-foreground animate-pulse">
              Loading...
            </div>
          )}
          {error && (
            <div className="px-3 py-4 text-[11px] text-destructive">
              {error.message || "Failed to load file"}
            </div>
          )}
          {data && (
            <pre className="px-3 py-2 text-[11px] font-mono leading-relaxed text-foreground/80">
              {lines.join("\n")}
              {truncated && "\n... (showing first 50 lines)"}
            </pre>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
