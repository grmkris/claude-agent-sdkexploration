"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";

import {
  getFileIcon,
  isBinaryFile,
} from "@/components/right-sidebar/file-type-icon";
import { orpc } from "@/lib/orpc";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FilePage({
  params,
}: {
  params: Promise<{ slug: string; path: string[] }>;
}) {
  const { slug, path: pathSegments } = use(params);
  const filePath = pathSegments.join("/");
  const fileName = pathSegments.at(-1) ?? filePath;
  const binary = isBinaryFile(fileName);

  const { icon, colorClass } = getFileIcon(fileName, false, false);

  const { data, isLoading, error } = useQuery({
    ...orpc.projects.readFile.queryOptions({ input: { slug, path: filePath } }),
    enabled: !binary,
    staleTime: 30_000,
  });

  const lines = data?.content.split("\n") ?? [];

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background px-4 py-3">
        <Link
          href={`/project/${slug}`}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <HugeiconsIcon
          icon={icon}
          size={14}
          strokeWidth={1.5}
          className={colorClass}
        />
        <span className="font-mono text-sm text-foreground">{filePath}</span>
        {data && (
          <span className="ml-auto text-xs text-muted-foreground">
            {lines.length} lines · {formatSize(new Blob([data.content]).size)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        {binary && (
          <p className="text-sm text-muted-foreground italic">
            Binary file — preview not available.
          </p>
        )}
        {!binary && isLoading && (
          <p className="animate-pulse text-sm text-muted-foreground">
            Loading…
          </p>
        )}
        {!binary && error && (
          <p className="text-sm text-destructive">
            {error.message || "Failed to load file."}
          </p>
        )}
        {!binary && data && (
          <table className="w-full border-collapse font-mono text-xs leading-relaxed">
            <tbody>
              {lines.map((line, i) => (
                <tr
                  key={i}
                  className="group hover:bg-muted/40 transition-colors"
                >
                  <td className="w-12 select-none pr-4 text-right text-muted-foreground/40 group-hover:text-muted-foreground/70">
                    {i + 1}
                  </td>
                  <td className="whitespace-pre text-foreground/85">
                    {line || " "}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
