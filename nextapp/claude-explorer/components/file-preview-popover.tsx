"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { orpc } from "@/lib/orpc";

// Lazy-load heavy highlighter — only pulled in when a popover opens
const ShikiHighlighter = dynamic(
  () => import("react-shiki").then((m) => ({ default: m.ShikiHighlighter })),
  { ssr: false, loading: () => <PreSkeleton /> }
);

const MarkdownContent = dynamic(
  () =>
    import("@/components/markdown-content").then((m) => ({
      default: m.MarkdownContent,
    })),
  { ssr: false }
);

function PreSkeleton() {
  return (
    <div className="animate-pulse px-3 py-4 text-[11px] text-muted-foreground">
      Highlighting…
    </div>
  );
}

// ── extension helpers ─────────────────────────────────────────────────────────

const MARKDOWN_EXTS = new Set(["md", "mdx"]);

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ico",
  "bmp",
  "tiff",
  "avif",
]);

const BINARY_PREVIEW_EXTS = new Set([
  "pdf",
  "docx",
  "doc",
  "xlsx",
  "xls",
  "pptx",
  "ppt",
  "mp4",
  "webm",
  "mov",
  "mp3",
  "wav",
  "flac",
  "zip",
  "tar",
  "gz",
  "exe",
  "dll",
  "so",
  "dylib",
]);

function extToLang(filename: string): string {
  const ext = filename.split(".").at(-1)?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    pyw: "python",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    cpp: "cpp",
    c: "c",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    rb: "ruby",
    php: "php",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "fish",
    ps1: "powershell",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    html: "html",
    htm: "html",
    xml: "xml",
    svg: "xml",
    json: "json",
    jsonc: "jsonc",
    jsonl: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    ini: "ini",
    env: "dotenv",
    sql: "sql",
    graphql: "graphql",
    gql: "graphql",
    lua: "lua",
    r: "r",
    ex: "elixir",
    exs: "elixir",
    tf: "hcl",
    hcl: "hcl",
    txt: "text",
    log: "text",
    rst: "text",
    csv: "text",
  };
  return map[ext] ?? "text";
}

function getPreviewType(
  filename: string
): "markdown" | "image" | "code" | "binary" {
  const ext = filename.split(".").at(-1)?.toLowerCase() ?? "";
  if (MARKDOWN_EXTS.has(ext)) return "markdown";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (BINARY_PREVIEW_EXTS.has(ext)) return "binary";
  return "code";
}

// ── component ─────────────────────────────────────────────────────────────────

const PREVIEW_LINES = 60;

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
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Determine whether the path is inside the project root.
  // When resolved.path is known, an absolute filePath that doesn't start with
  // the project root is "outside" — we can display it but can't serve it
  // through the project-scoped API (which would throw a 500).
  const isOutsideProject =
    resolved?.path !== undefined && !filePath.startsWith(resolved.path);

  const relativePath = resolved?.path
    ? filePath.startsWith(resolved.path)
      ? filePath.slice(resolved.path.length).replace(/^\//, "")
      : null // outside project → no relative path
    : null;

  const fileName =
    relativePath?.split("/").at(-1) ?? filePath.split("/").at(-1) ?? "";

  const previewType = getPreviewType(fileName);
  const needsText = previewType === "code" || previewType === "markdown";

  const { data, isLoading, error } = useQuery({
    ...orpc.projects.readFile.queryOptions({
      input: { slug: projectSlug, path: relativePath ?? "" },
    }),
    // Don't attempt to read files outside the project root — the API will 500
    enabled: open && relativePath !== null && !isOutsideProject && needsText,
    staleTime: 30_000,
  });

  const lines = data?.content.split("\n").slice(0, PREVIEW_LINES) ?? [];
  const truncated = data && data.content.split("\n").length > PREVIEW_LINES;
  const previewContent = lines.join("\n");

  const fileSrc = `/api/files?slug=${encodeURIComponent(projectSlug)}&path=${encodeURIComponent(relativePath ?? filePath)}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="cursor-pointer decoration-dotted underline-offset-2 hover:underline"
        render={(props) => <span {...props}>{children}</span>}
      />
      <PopoverContent side="bottom" align="start" className="w-[520px] p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-3 py-1.5">
          <code className="truncate font-mono text-[11px] text-muted-foreground">
            {filePath}
          </code>
          {!isOutsideProject && (
            <Link
              href={`/project/${projectSlug}?file=${encodeURIComponent(relativePath ?? filePath)}`}
              className="ml-2 shrink-0 text-[10px] text-primary hover:underline"
              onClick={() => setOpen(false)}
            >
              Open in explorer →
            </Link>
          )}
        </div>

        {/* Body */}
        <div className="max-h-80 overflow-auto">
          {/* File is outside the project root — can't preview via project API */}
          {isOutsideProject && (
            <div className="px-3 py-4 text-[11px] text-muted-foreground">
              This file is outside the project directory and cannot be previewed
              here.
            </div>
          )}

          {/* Loading */}
          {!isOutsideProject && isLoading && (
            <div className="animate-pulse px-3 py-4 text-[11px] text-muted-foreground">
              Loading…
            </div>
          )}

          {/* Error */}
          {!isOutsideProject && error && (
            <div className="px-3 py-4 text-[11px] text-destructive">
              {error.message || "Failed to load file"}
            </div>
          )}

          {/* Markdown preview */}
          {previewType === "markdown" && data && (
            <div className="px-3 py-2 text-xs">
              <MarkdownContent isStreaming={false}>
                {previewContent}
              </MarkdownContent>
              {truncated && (
                <p className="mt-1 text-[10px] italic text-muted-foreground">
                  … showing first {PREVIEW_LINES} lines
                </p>
              )}
            </div>
          )}

          {/* Code with syntax highlighting */}
          {previewType === "code" && data && (
            <div className="overflow-x-auto">
              <ShikiHighlighter
                language={extToLang(fileName)}
                theme="github-dark"
                className="!bg-transparent text-[11px] leading-relaxed [&_code]:font-mono [&_pre]:!bg-transparent [&_pre]:px-3 [&_pre]:py-2"
                showLanguage={false}
                addDefaultStyles={false}
              >
                {previewContent}
              </ShikiHighlighter>
              {truncated && (
                <p className="px-3 pb-2 text-[10px] italic text-muted-foreground">
                  … showing first {PREVIEW_LINES} lines
                </p>
              )}
            </div>
          )}

          {/* Image preview */}
          {!isOutsideProject && previewType === "image" && (
            <div className="flex items-center justify-center p-3">
              {/* biome-ignore lint/performance/noImgElement: popover preview with dynamic src */}
              <img
                src={fileSrc}
                alt={fileName}
                className="max-h-64 max-w-full rounded object-contain"
              />
            </div>
          )}

          {/* Binary / office / media — show hint + download */}
          {!isOutsideProject && previewType === "binary" && (
            <div className="flex items-center gap-3 px-3 py-4">
              <p className="text-[11px] text-muted-foreground">
                Open in the file explorer for full rendering.
              </p>
              <a
                href={fileSrc}
                download={fileName}
                className="shrink-0 rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
              >
                ↓ Download
              </a>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
