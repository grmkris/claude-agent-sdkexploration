import { getSessionMessages } from "@/lib/claude-fs"
import { type NextRequest } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const project = req.nextUrl.searchParams.get("project")
  if (!project) {
    return Response.json({ error: "Missing ?project= query param" }, { status: 400 })
  }

  const messages = await getSessionMessages(project, id)
  return Response.json(messages)
}
