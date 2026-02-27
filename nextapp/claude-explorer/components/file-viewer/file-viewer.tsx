"use client";

import dynamic from "next/dynamic";

// Lazy-load heavy viewers so they don't bloat the initial bundle
const PDFViewer = dynamic(
  () => import("./pdf-viewer").then((m) => ({ default: m.PDFViewer })),
  { ssr: false, loading: () => <ViewerSkeleton label="Loading PDF viewer…" /> }
);

const XlsxViewer = dynamic(
  () => import("./xlsx-viewer").then((m) => ({ default: m.XlsxViewer })),
  { ssr: false, loading: () => <ViewerSkeleton label="Loading spreadsheet…" /> }
);

const DocxViewer = dynamic(
  () => import("./docx-viewer").then((m) => ({ default: m.DocxViewer })),
  { ssr: false, loading: () => <ViewerSkeleton label="Loading document…" /> }
);

const ImageViewer = dynamic(
  () => import("./image-viewer").then((m) => ({ default: m.ImageViewer })),
  { ssr: false }
);

const VideoViewer = dynamic(
  () => import("./video-viewer").then((m) => ({ default: m.VideoViewer })),
  { ssr: false }
);

const AudioViewer = dynamic(
  () => import("./audio-viewer").then((m) => ({ default: m.AudioViewer })),
  { ssr: false }
);

const CodeViewer = dynamic(
  () => import("./code-viewer").then((m) => ({ default: m.CodeViewer })),
  { ssr: false }
);

const MarkdownViewer = dynamic(
  () =>
    import("./markdown-viewer").then((m) => ({ default: m.MarkdownViewer })),
  { ssr: false }
);

// ─── format classification ───────────────────────────────────────────────────

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
const VIDEO_EXTS = new Set(["mp4", "webm", "ogg", "mov"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "flac", "aac", "m4a"]);
const MARKDOWN_EXTS = new Set(["md", "mdx"]);
const XLSX_EXTS = new Set(["xlsx", "xls", "ods", "csv"]);
const DOCX_EXTS = new Set(["docx", "doc", "odt", "pptx", "ppt"]);

type FileCategory =
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "markdown"
  | "xlsx"
  | "docx"
  | "code"
  | "unknown";

function classify(filename: string): FileCategory {
  const ext = filename.split(".").at(-1)?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (MARKDOWN_EXTS.has(ext)) return "markdown";
  if (XLSX_EXTS.has(ext)) return "xlsx";
  if (DOCX_EXTS.has(ext)) return "docx";
  // Everything else treated as code/text
  if (ext) return "code";
  return "unknown";
}

// ─── props ───────────────────────────────────────────────────────────────────

interface FileViewerProps {
  /** URL to fetch/stream the file from (e.g. /api/files?slug=…&path=…) */
  src: string;
  /** Raw text content — provided for text/code/markdown files to avoid a second fetch */
  content?: string;
  filename: string;
}

// ─── skeleton ─────────────────────────────────────────────────────────────────

function ViewerSkeleton({ label }: { label?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground animate-pulse">
      {label ?? "Loading…"}
    </div>
  );
}

// ─── main dispatcher ──────────────────────────────────────────────────────────

export function FileViewer({ src, content, filename }: FileViewerProps) {
  const category = classify(filename);

  switch (category) {
    case "pdf":
      return <PDFViewer src={src} filename={filename} />;

    case "image":
      return <ImageViewer src={src} filename={filename} />;

    case "video":
      return <VideoViewer src={src} filename={filename} />;

    case "audio":
      return <AudioViewer src={src} filename={filename} />;

    case "markdown":
      if (content != null) return <MarkdownViewer content={content} />;
      return <ViewerSkeleton label="Loading…" />;

    case "xlsx":
      return <XlsxViewer src={src} filename={filename} />;

    case "docx":
      return <DocxViewer src={src} filename={filename} />;

    case "code":
      if (content != null)
        return <CodeViewer content={content} filename={filename} />;
      return <ViewerSkeleton label="Loading…" />;

    default:
      return (
        <div className="flex flex-col items-center gap-4 py-16 text-sm text-muted-foreground">
          <p>Preview not available for this file type.</p>
          <a
            href={src}
            download={filename}
            className="rounded border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            ↓ Download {filename}
          </a>
        </div>
      );
  }
}
