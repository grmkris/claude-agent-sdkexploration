import type { IconSvgElement } from "@hugeicons/react";

import {
  CssFile01Icon,
  File01Icon,
  Folder01Icon,
  FolderOpenIcon,
  GitBranchIcon,
  HtmlFile01Icon,
  Image01Icon,
  JavaScriptIcon,
  Package01Icon,
  PythonIcon,
  ComputerTerminalIcon,
  Configuration01Icon,
  Pdf01Icon,
  Video01Icon,
  MusicNote01Icon,
  GridTableIcon,
  FileAttachmentIcon,
} from "@hugeicons/core-free-icons";

export type FileIconDef = {
  icon: IconSvgElement;
  colorClass: string;
};

// True binary files that cannot be rendered at all
const BINARY_EXTENSIONS = new Set([
  "zip",
  "tar",
  "gz",
  "bz2",
  "7z",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "otf",
  "exe",
  "dll",
  "so",
  "dylib",
  "avi", // not supported by native video element cross-browser
]);

export function isBinaryFile(name: string): boolean {
  const ext = name.split(".").at(-1)?.toLowerCase() ?? "";
  return BINARY_EXTENSIONS.has(ext);
}

export function getFileIcon(
  name: string,
  isDirectory: boolean,
  isExpanded?: boolean
): FileIconDef {
  if (isDirectory) {
    return {
      icon: isExpanded ? FolderOpenIcon : Folder01Icon,
      colorClass: "text-yellow-400/80",
    };
  }

  const ext = name.split(".").at(-1)?.toLowerCase() ?? "";
  const base = name.toLowerCase();

  // Special filenames
  if (
    base === "package.json" ||
    base === "bun.lock" ||
    base === "yarn.lock" ||
    base === "pnpm-lock.yaml" ||
    base === "package-lock.json"
  ) {
    return { icon: Package01Icon, colorClass: "text-green-400/80" };
  }
  if (
    base === ".gitignore" ||
    base === ".gitmodules" ||
    base === ".gitattributes"
  ) {
    return { icon: GitBranchIcon, colorClass: "text-orange-400/80" };
  }
  if (base === "dockerfile" || base.startsWith("docker-compose")) {
    return { icon: ComputerTerminalIcon, colorClass: "text-blue-300/80" };
  }

  switch (ext) {
    case "ts":
    case "tsx":
      return { icon: JavaScriptIcon, colorClass: "text-blue-400/80" };
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return { icon: JavaScriptIcon, colorClass: "text-yellow-400/80" };
    case "py":
    case "pyw":
      return { icon: PythonIcon, colorClass: "text-yellow-300/80" };
    case "css":
    case "scss":
    case "sass":
    case "less":
      return { icon: CssFile01Icon, colorClass: "text-purple-400/80" };
    case "html":
    case "htm":
      return { icon: HtmlFile01Icon, colorClass: "text-orange-400/80" };
    case "json":
    case "jsonl":
    case "jsonc":
      return { icon: Configuration01Icon, colorClass: "text-yellow-400/80" };
    case "yaml":
    case "yml":
    case "toml":
    case "ini":
    case "env":
      return { icon: Configuration01Icon, colorClass: "text-gray-400/80" };
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
    case "ico":
    case "bmp":
    case "tiff":
    case "avif":
      return { icon: Image01Icon, colorClass: "text-pink-400/80" };
    case "mp4":
    case "webm":
    case "ogg":
    case "mov":
      return { icon: Video01Icon, colorClass: "text-purple-400/80" };
    case "mp3":
    case "wav":
    case "flac":
    case "aac":
    case "m4a":
      return { icon: MusicNote01Icon, colorClass: "text-indigo-400/80" };
    case "pdf":
      return { icon: Pdf01Icon, colorClass: "text-red-400/80" };
    case "xlsx":
    case "xls":
    case "csv":
    case "ods":
      return { icon: GridTableIcon, colorClass: "text-green-500/80" };
    case "docx":
    case "doc":
    case "odt":
    case "pptx":
    case "ppt":
      return { icon: FileAttachmentIcon, colorClass: "text-blue-400/80" };
    case "sh":
    case "bash":
    case "zsh":
    case "fish":
    case "ps1":
      return { icon: ComputerTerminalIcon, colorClass: "text-green-400/80" };
    case "md":
    case "mdx":
    case "txt":
    case "rst":
    case "log":
      return { icon: File01Icon, colorClass: "text-gray-300/80" };
    default:
      return { icon: File01Icon, colorClass: "text-muted-foreground" };
  }
}
