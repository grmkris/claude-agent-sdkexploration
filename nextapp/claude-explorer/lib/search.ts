import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

// Directories to skip during recursive file search
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  ".turbo",
  ".cache",
  ".output",
  "build",
  "coverage",
  "__pycache__",
  ".svelte-kit",
  ".nuxt",
  ".vercel",
]);

// Binary/non-text file extensions to skip
const SKIP_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".webp",
  ".bmp",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".mp4",
  ".webm",
  ".mp3",
  ".wav",
  ".ogg",
  ".zip",
  ".tar",
  ".gz",
  ".br",
  ".lock",
  ".lockb",
  ".pyc",
  ".so",
  ".dylib",
  ".dll",
  ".exe",
]);

export interface FileSearchResult {
  path: string; // relative to project root
  name: string; // basename
  isDirectory: boolean;
}

/**
 * Search project files by name.
 *
 * Strategy:
 * 1. Try ripgrep `rg --files` (fast, respects .gitignore)
 * 2. Fall back to recursive readdir walk with depth + result limits
 */
export async function searchProjectFiles(
  projectPath: string,
  query: string,
  options: { maxResults?: number; maxDepth?: number } = {}
): Promise<FileSearchResult[]> {
  const maxResults = options.maxResults ?? 50;
  const maxDepth = options.maxDepth ?? 8;
  const lowerQuery = query.toLowerCase();
  const results: FileSearchResult[] = [];

  // Try ripgrep first — fast, respects .gitignore automatically
  try {
    const proc = Bun.spawn(["rg", "--files", "--color", "never"], {
      cwd: projectPath,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    const lines = stdout.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      if (results.length >= maxResults) break;
      const name = line.split("/").pop() ?? line;
      if (name.toLowerCase().includes(lowerQuery)) {
        results.push({ path: line, name, isDirectory: false });
      }
    }
    if (results.length > 0) return results;
  } catch {
    // ripgrep not available or failed — fall through to manual walk
  }

  // Fallback: manual recursive readdir
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth || results.length >= maxResults) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) return;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            path: relative(projectPath, join(dir, entry.name)),
            name: entry.name,
            isDirectory: true,
          });
        }
        await walk(join(dir, entry.name), depth + 1);
      } else {
        const dotIdx = entry.name.lastIndexOf(".");
        const ext = dotIdx >= 0 ? entry.name.slice(dotIdx).toLowerCase() : "";
        if (SKIP_EXTENSIONS.has(ext)) continue;
        if (entry.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            path: relative(projectPath, join(dir, entry.name)),
            name: entry.name,
            isDirectory: false,
          });
        }
      }
    }
  }

  await walk(projectPath, 0);
  return results;
}
