import { listSessions } from "@/lib/claude-fs"
import { type NextRequest } from "next/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const sessions = await listSessions(slug)
  return Response.json(sessions)
}
