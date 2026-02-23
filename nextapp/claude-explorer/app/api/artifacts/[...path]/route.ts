import { join, resolve } from "node:path";

import { resolveSlugToPath } from "@/lib/claude-fs";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segments = (await params).path;
  if (!segments || segments.length < 2) {
    return new Response("Missing slug or file path", { status: 400 });
  }

  const slug = segments[0];
  const filePath = segments.slice(1).join("/");

  // Security: reject path traversal
  if (filePath.includes("..") || slug.includes("..")) {
    return new Response("Invalid path", { status: 400 });
  }

  try {
    const projectPath = await resolveSlugToPath(slug);
    const fullPath = resolve(join(projectPath, filePath));

    // Ensure resolved path is within project root
    if (!fullPath.startsWith(projectPath)) {
      return new Response("Invalid path", { status: 400 });
    }

    const file = Bun.file(fullPath);
    const exists = await file.exists();
    if (!exists) {
      return new Response("Not found", { status: 404 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return new Response("File too large", { status: 413 });
    }

    const mime = file.type || "application/octet-stream";
    const headers: Record<string, string> = {
      "Content-Type": mime,
      "Content-Disposition": "inline",
    };

    // Add CSP sandbox for HTML files
    if (mime === "text/html" || mime === "application/xhtml+xml") {
      headers["Content-Security-Policy"] =
        "sandbox allow-scripts; default-src 'self' 'unsafe-inline' data: blob:";
    }

    return new Response(file, { headers });
  } catch {
    return new Response("Error reading file", { status: 500 });
  }
}
