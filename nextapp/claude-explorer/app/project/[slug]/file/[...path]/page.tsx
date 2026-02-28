"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";

import { useContextTray } from "@/components/context-tray/context-tray-context";
import { FileViewer } from "@/components/file-viewer/file-viewer";
import { SelectableCodeViewer } from "@/components/file-viewer/selectable-code-viewer";
import {
  getFileIcon,
  isBinaryFile,
} from "@/components/right-sidebar/file-type-icon";
import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/orpc";

// Extensions that need a text content fetch (rendered via code/markdown viewers)
const TEXT_EXTS = new Set([
  "md",
  "mdx",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "pyw",
  "rs",
  "go",
  "java",
  "kt",
  "swift",
  "cpp",
  "c",
  "h",
  "hpp",
  "cs",
  "rb",
  "php",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "css",
  "scss",
  "sass",
  "less",
  "html",
  "htm",
  "xml",
  "svg",
  "json",
  "jsonc",
  "jsonl",
  "yaml",
  "yml",
  "toml",
  "ini",
  "env",
  "sql",
  "graphql",
  "gql",
  "lua",
  "vim",
  "r",
  "jl",
  "ex",
  "exs",
  "erl",
  "hs",
  "clj",
  "tf",
  "hcl",
  "txt",
  "log",
  "rst",
  "csv",
]);

// Extensions handled by URL-based viewers (they fetch the file themselves)
const URL_EXTS = new Set([
  "pdf",
  "docx",
  "doc",
  "odt",
  "pptx",
  "ppt",
  "xlsx",
  "xls",
  "ods",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "bmp",
  "tiff",
  "avif",
  "mp4",
  "webm",
  "ogg",
  "mov",
  "mp3",
  "wav",
  "flac",
  "aac",
  "m4a",
]);

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
  const router = useRouter();
  const { addChip } = useContextTray();

  const { slug, path: pathSegments } = use(params);
  const filePath = pathSegments.join("/");
  const fileName = pathSegments.at(-1) ?? filePath;
  const ext = fileName.split(".").at(-1)?.toLowerCase() ?? "";

  const binary = isBinaryFile(fileName);
  const needsText = TEXT_EXTS.has(ext);
  const needsUrl = URL_EXTS.has(ext);

  const { icon, colorClass } = getFileIcon(fileName, false, false);

  // Fetch text content only for text/code/markdown files
  const {
    data: textData,
    isLoading: textLoading,
    error: textError,
  } = useQuery({
    ...orpc.projects.readFile.queryOptions({ input: { slug, path: filePath } }),
    enabled: needsText,
    staleTime: 30_000,
  });

  const lines = textData?.content.split("\n") ?? [];
  const fileSrc = `/api/files?slug=${encodeURIComponent(slug)}&path=${encodeURIComponent(filePath)}`;

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
        <div className="ml-auto flex items-center gap-2">
          {textData && (
            <span className="text-xs text-muted-foreground">
              {lines.length} lines ·{" "}
              {formatSize(new Blob([textData.content]).size)}
            </span>
          )}
          {(needsUrl || binary) && (
            <a
              href={fileSrc}
              download={fileName}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              ↓ Download
            </a>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-xs gap-1.5 h-7"
            onClick={() => {
              addChip({
                id: crypto.randomUUID(),
                type: "file",
                label: fileName,
                subtitle: filePath,
                filePath,
              });
            }}
          >
            📎 Add to tray
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1.5 h-7"
            onClick={() => {
              const chips = JSON.stringify([
                { type: "file", filePath, label: fileName },
              ]);
              router.push(
                `/project/${slug}/chat?chips=${encodeURIComponent(chips)}`
              );
            }}
          >
            ✦ Ask Claude
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col">
        {/* True binary — no viewer available */}
        {binary && (
          <div className="flex flex-col items-center gap-4 py-16 text-sm text-muted-foreground">
            <p>Binary file — preview not available.</p>
            <a
              href={fileSrc}
              download={fileName}
              className="rounded border border-border px-3 py-1.5 text-xs hover:bg-muted"
            >
              ↓ Download {fileName}
            </a>
          </div>
        )}

        {/* URL-based viewers: PDF, images, video, audio, office docs */}
        {needsUrl && <FileViewer src={fileSrc} filename={fileName} />}

        {/* Text / code / markdown viewers */}
        {needsText && (
          <>
            {textLoading && (
              <p className="animate-pulse px-4 py-8 text-sm text-muted-foreground">
                Loading…
              </p>
            )}
            {textError && (
              <p className="px-4 py-8 text-sm text-destructive">
                {textError.message || "Failed to load file."}
              </p>
            )}
            {textData &&
              (ext === "md" || ext === "mdx" ? (
                <FileViewer
                  src={fileSrc}
                  content={textData.content}
                  filename={fileName}
                />
              ) : (
                <SelectableCodeViewer
                  content={textData.content}
                  filename={fileName}
                  filePath={filePath}
                />
              ))}
          </>
        )}

        {/* Fallback for unrecognised extensions */}
        {!binary && !needsText && !needsUrl && (
          <FileViewer src={fileSrc} filename={fileName} />
        )}
      </div>
    </div>
  );
}
