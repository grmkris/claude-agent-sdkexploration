"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";

import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

type ViewMode = "diff" | "file";

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

function FileView({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <table className="w-full border-collapse font-mono text-xs leading-relaxed">
      <tbody>
        {lines.map((line, i) => (
          <tr key={i} className="group transition-colors hover:bg-muted/40">
            <td className="w-12 select-none pr-4 text-right text-muted-foreground/40 group-hover:text-muted-foreground/70">
              {i + 1}
            </td>
            <td className="whitespace-pre text-foreground/85">{line || " "}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DiffPage({
  params,
}: {
  params: Promise<{ slug: string; path: string[] }>;
}) {
  const { slug, path: pathSegments } = use(params);
  const filePath = pathSegments.join("/");
  const [mode, setMode] = useState<ViewMode>("diff");

  const { data: diffData, isLoading: diffLoading } = useQuery({
    ...orpc.projects.gitDiff.queryOptions({
      input: { slug, path: filePath },
    }),
  });

  const { data: fileData, isLoading: fileLoading } = useQuery({
    ...orpc.projects.readFile.queryOptions({
      input: { slug, path: filePath },
    }),
    enabled: mode === "file",
    staleTime: 30_000,
  });

  const isLoading = mode === "diff" ? diffLoading : fileLoading;

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

        {/* Diff stats */}
        {diffData && mode === "diff" && (
          <span className="text-xs">
            <span className="text-green-400">+{diffData.additions}</span>{" "}
            <span className="text-red-400">-{diffData.deletions}</span>
          </span>
        )}

        {/* File size */}
        {fileData && mode === "file" && (
          <span className="text-xs text-muted-foreground">
            {fileData.content.split("\n").length} lines
          </span>
        )}

        {/* Diff / File toggle */}
        <div className="ml-auto flex items-center rounded-md border text-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setMode("diff")}
            className={cn(
              "px-3 py-1 transition-colors",
              mode === "diff"
                ? "bg-muted text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Diff
          </button>
          <button
            type="button"
            onClick={() => setMode("file")}
            className={cn(
              "px-3 py-1 transition-colors border-l",
              mode === "file"
                ? "bg-muted text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            File
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : mode === "diff" ? (
          !diffData ? (
            <p className="text-sm text-muted-foreground">
              No diff available for this file.
            </p>
          ) : (
            <DiffView diff={diffData.diff} />
          )
        ) : !fileData ? (
          <p className="text-sm text-muted-foreground">
            Could not load file content.
          </p>
        ) : (
          <FileView content={fileData.content} />
        )}
      </div>
    </div>
  );
}
