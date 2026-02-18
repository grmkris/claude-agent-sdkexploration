import { listProjects } from "@/lib/claude-fs"

export async function GET() {
  const projects = await listProjects()
  return Response.json(projects)
}
