"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";

import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

function DiffView({ diff }: { diff: string }) {
  return (
    <pre className="overflow-x-auto whitespace-pre text-xs leading-relaxed">
      {diff.split("\n").map((line, i) => (
        <span
          key={i}
          className={cn(
            "block px-4",
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

export default function DiffPage({
  params,
}: {
  params: Promise<{ slug: string; path: string[] }>;
}) {
  const { slug, path: pathSegments } = use(params);
  const filePath = pathSegments.join("/");

  const { data, isLoading } = useQuery({
    ...orpc.projects.gitDiff.queryOptions({
      input: { slug, path: filePath },
    }),
  });

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background px-4 py-3">
        <Link
          href={`/project/${slug}`}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back
        </Link>
        <span className="font-mono text-sm text-foreground">{filePath}</span>
        {data && (
          <span className="ml-auto text-xs">
            <span className="text-green-400">+{data.additions}</span>{" "}
            <span className="text-red-400">-{data.deletions}</span>
          </span>
        )}
      </div>

      {/* Diff content */}
      <div className="flex-1 p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading diff…</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">
            No diff available for this file.
          </p>
        ) : (
          <DiffView diff={data.diff} />
        )}
      </div>
    </div>
  );
}
