import { join, basename } from "node:path";

import { resolveSlugToPath } from "@/lib/claude-fs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  const filePath = url.searchParams.get("path");

  if (!slug || !filePath) {
    return new Response("Missing slug or path", { status: 400 });
  }

  // Security: prevent path traversal
  if (filePath.includes("..")) {
    return new Response("Invalid path", { status: 400 });
  }

  try {
    const projectPath = await resolveSlugToPath(slug);
    const fullPath = join(projectPath, filePath);

    // Ensure it's within project root
    if (!fullPath.startsWith(projectPath)) {
      return new Response("Invalid path", { status: 400 });
    }

    const file = Bun.file(fullPath);
    const exists = await file.exists();
    if (!exists) {
      return new Response("Not found", { status: 404 });
    }

    const filename = basename(fullPath);
    return new Response(file, {
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return new Response("Error reading file", { status: 500 });
  }
}
