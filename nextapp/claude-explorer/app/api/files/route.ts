import { stat } from "node:fs/promises";
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

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const slug = formData.get("slug") as string | null;
    const targetPath = formData.get("path") as string | null;
    const file = formData.get("file") as File | null;

    if (!slug || !file) {
      return Response.json({ error: "Missing slug or file" }, { status: 400 });
    }

    const dir = targetPath ?? "";
    const filename = file.name;

    // Security: reject path traversal
    if (
      dir.includes("..") ||
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\")
    ) {
      return Response.json({ error: "Invalid path" }, { status: 400 });
    }

    const projectPath = await resolveSlugToPath(slug);
    const targetDir = join(projectPath, dir);
    const fullPath = join(targetDir, filename);

    if (!fullPath.startsWith(projectPath)) {
      return Response.json({ error: "Invalid path" }, { status: 400 });
    }

    // Ensure target directory exists
    const dirStat = await stat(targetDir).catch(() => null);
    if (!dirStat?.isDirectory()) {
      return Response.json(
        { error: "Target directory not found" },
        { status: 404 }
      );
    }

    await Bun.write(fullPath, await file.arrayBuffer());

    return Response.json({ success: true, name: filename, size: file.size });
  } catch {
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
