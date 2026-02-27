import { join, resolve } from "node:path";
import { homedir } from "node:os";

const USER_HOME = process.env.CLAUDE_CONFIG_DIR ?? homedir();
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function GET(request: Request) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId");
  const filename = url.searchParams.get("filename");

  if (!eventId || !filename) {
    return new Response("Missing eventId or filename", { status: 400 });
  }

  // Security: reject path traversal attempts
  if (eventId.includes("..") || eventId.includes("/") || eventId.includes("\\")) {
    return new Response("Invalid eventId", { status: 400 });
  }
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return new Response("Invalid filename", { status: 400 });
  }

  const emailDir = join(USER_HOME, "emails", eventId);
  const fullPath = resolve(join(emailDir, "attachments", filename));

  // Ensure resolved path is within the event's email directory
  if (!fullPath.startsWith(emailDir)) {
    return new Response("Invalid path", { status: 400 });
  }

  try {
    const file = Bun.file(fullPath);
    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return new Response("File too large", { status: 413 });
    }

    const mime = file.type || "application/octet-stream";
    const headers: Record<string, string> = {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    };

    return new Response(file, { headers });
  } catch {
    return new Response("Error reading file", { status: 500 });
  }
}
