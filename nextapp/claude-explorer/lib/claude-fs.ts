import { readdir, stat, readFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import type { Project, SessionMeta, ChatMessage, RawJSONLLine, ContentBlock } from "./types"

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects")

/** Decode a Claude project slug back to a filesystem path */
function decodeSlug(slug: string): string {
  // Slugs are encoded as dash-separated path segments, e.g. "-Users-kristjangrm-Code-foo"
  // The leading dash represents the root "/"
  return slug.replace(/-/g, "/")
}

/** List all projects from ~/.claude/projects/ */
export async function listProjects(): Promise<Project[]> {
  let entries: string[]
  try {
    entries = await readdir(CLAUDE_PROJECTS_DIR)
  } catch {
    return []
  }

  const projects: Project[] = []

  for (const slug of entries) {
    const dir = join(CLAUDE_PROJECTS_DIR, slug)
    const s = await stat(dir).catch(() => null)
    if (!s?.isDirectory()) continue

    const files = await readdir(dir).catch(() => [] as string[])
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"))

    // Get last modified time from most recent jsonl
    let lastActive: string | undefined
    if (jsonlFiles.length > 0) {
      const stats = await Promise.all(
        jsonlFiles.map(async (f) => {
          const fStat = await stat(join(dir, f)).catch(() => null)
          return fStat ? fStat.mtimeMs : 0
        })
      )
      const maxMtime = Math.max(...stats)
      if (maxMtime > 0) lastActive = new Date(maxMtime).toISOString()
    }

    projects.push({
      slug,
      path: decodeSlug(slug),
      sessionCount: jsonlFiles.length,
      lastActive,
    })
  }

  // Sort by last active descending
  projects.sort((a, b) => {
    if (!a.lastActive) return 1
    if (!b.lastActive) return -1
    return b.lastActive.localeCompare(a.lastActive)
  })

  return projects
}

/** List sessions for a project, sorted by mtime desc */
export async function listSessions(slug: string): Promise<SessionMeta[]> {
  const dir = join(CLAUDE_PROJECTS_DIR, slug)
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return []
  }

  const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"))

  // Get stats for sorting
  const fileStats = await Promise.all(
    jsonlFiles.map(async (f) => {
      const fStat = await stat(join(dir, f)).catch(() => null)
      return { file: f, mtime: fStat?.mtimeMs ?? 0 }
    })
  )
  fileStats.sort((a, b) => b.mtime - a.mtime)

  const sessions: SessionMeta[] = []

  for (const { file } of fileStats) {
    const id = file.replace(".jsonl", "")
    const filePath = join(dir, file)

    try {
      const content = await readFile(filePath, "utf-8")
      const lines = content.trim().split("\n")
      if (lines.length === 0) continue

      let firstPrompt = ""
      let timestamp = ""
      let model = ""
      let gitBranch = ""
      let turns = 0
      let cost = 0

      // Scan for first user message and track metadata
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as RawJSONLLine
          if (parsed.type === "user" && "message" in parsed) {
            turns++
            if (!firstPrompt) {
              const textBlock = parsed.message.content.find(
                (b: { type: string }) => b.type === "text"
              )
              if (textBlock && "text" in textBlock) {
                firstPrompt = textBlock.text.slice(0, 200)
              }
              timestamp = parsed.timestamp
              gitBranch = (parsed as { gitBranch?: string }).gitBranch ?? ""
            }
          } else if (parsed.type === "assistant" && "message" in parsed) {
            if (!model && parsed.message && "model" in parsed.message) {
              model = (parsed.message as { model?: string }).model ?? ""
            }
            // Sum output tokens for rough cost estimate
            if (parsed.message && "usage" in parsed.message) {
              const usage = (parsed.message as { usage?: { output_tokens?: number; input_tokens?: number } }).usage
              if (usage) {
                // Rough cost: $3/M input, $15/M output for sonnet
                cost += ((usage.input_tokens ?? 0) * 3 + (usage.output_tokens ?? 0) * 15) / 1_000_000
              }
            }
          }
        } catch {
          // skip malformed lines
        }
      }

      if (!firstPrompt) continue

      sessions.push({
        id,
        firstPrompt,
        timestamp,
        model,
        turns,
        cost: Math.round(cost * 10000) / 10000,
        gitBranch,
      })
    } catch {
      // skip unreadable files
    }
  }

  return sessions
}

/** Parse full JSONL session into chat messages */
export async function getSessionMessages(slug: string, sessionId: string): Promise<ChatMessage[]> {
  const filePath = join(CLAUDE_PROJECTS_DIR, slug, `${sessionId}.jsonl`)

  let content: string
  try {
    content = await readFile(filePath, "utf-8")
  } catch {
    return []
  }

  const lines = content.trim().split("\n")
  const messages: ChatMessage[] = []

  // First pass: collect tool results keyed by tool_use_id
  const toolResults = new Map<string, { content: string; is_error?: boolean }>()
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as RawJSONLLine
      if (parsed.type === "user" && "message" in parsed) {
        for (const block of parsed.message.content) {
          if (block.type === "tool_result") {
            toolResults.set(block.tool_use_id, {
              content: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
              is_error: block.is_error,
            })
          }
        }
      }
    } catch {
      // skip
    }
  }

  // Second pass: build messages, enriching tool_use with outputs
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as RawJSONLLine
      if (parsed.type === "user" && "message" in parsed) {
        const textBlocks = parsed.message.content.filter(
          (b: { type: string }) => b.type === "text"
        )
        if (textBlocks.length === 0) continue

        messages.push({
          role: "user",
          content: textBlocks as ContentBlock[],
          timestamp: parsed.timestamp,
          uuid: parsed.uuid,
        })
      } else if (parsed.type === "assistant" && "message" in parsed) {
        // Enrich tool_use blocks with their results
        const enrichedContent = parsed.message.content.map((block) => {
          if (block.type === "tool_use") {
            const result = toolResults.get(block.id)
            if (result) {
              return { ...block, output: result.content, is_error: result.is_error }
            }
          }
          return block
        })

        messages.push({
          role: "assistant",
          content: enrichedContent as ContentBlock[],
          timestamp: parsed.timestamp,
          uuid: parsed.uuid,
          model: (parsed.message as { model?: string }).model,
        })
      }
    } catch {
      // skip
    }
  }

  return messages
}
