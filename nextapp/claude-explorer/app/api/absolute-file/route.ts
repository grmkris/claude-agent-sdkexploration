import { readFile } from "node:fs/promises";
import { homedir } from "node:os";

const SAFE_PREFIXES = [homedir()];
const MAX_SIZE = 100 * 1024; // 100 KB

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get("path");

  if (!filePath) return new Response("Missing path", { status: 400 });
  if (filePath.includes(".."))
    return new Response("Invalid path", { status: 400 });
  if (!filePath.startsWith("/"))
    return new Response("Path must be absolute", { status: 400 });
  if (!SAFE_PREFIXES.some((p) => filePath.startsWith(p + "/"))) {
    return new Response("Path not allowed", { status: 403 });
  }

  try {
    const content = await readFile(filePath, "utf-8");
    const truncated =
      content.length > MAX_SIZE ? content.slice(0, MAX_SIZE) : content;
    return Response.json({ content: truncated, size: content.length });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
