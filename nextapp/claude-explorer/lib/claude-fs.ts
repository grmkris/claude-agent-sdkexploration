import { readdir, stat, readFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import { $ } from "bun"
import type {
  Project,
  SessionMeta,
  RecentSession,
  Favorites,
  ParsedMessage,
  ContentBlock,
  RawJSONLLine,
  RawUserMessage,
  RawAssistantMessage,
} from "./types"

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects")
const FAVORITES_PATH = join(homedir(), ".claude", "explorer-favorites.json")

function isUserLine(line: RawJSONLLine): line is RawUserMessage {
  return line.type === "user"
}

function isAssistantLine(line: RawJSONLLine): line is RawAssistantMessage {
  return line.type === "assistant"
}

function decodeSlug(slug: string): string {
  return slug.replace(/-/g, "/")
}

function getTextFromContent(content: RawUserMessage["message"]["content"]): string | undefined {
  if (typeof content === "string") return content
  const textBlock = content.find((b) => b.type === "text")
  if (textBlock && "text" in textBlock) return textBlock.text
  return undefined
}

// --- Active session detection ---

export async function getRunningSessionIds(): Promise<Set<string>> {
  try {
    const output = await $`ps ax -o args=`.quiet().text()
    const ids = new Set<string>()
    for (const line of output.split("\n")) {
      const match = line.match(/claude\b.*--resume\s+(\S+)/)
      if (match) ids.add(match[1])
    }
    return ids
  } catch {
    return new Set()
  }
}

// --- Favorites persistence ---

export async function getFavorites(): Promise<Favorites> {
  try {
    return JSON.parse(await readFile(FAVORITES_PATH, "utf-8"))
  } catch {
    return { projects: [], sessions: [] }
  }
}

async function writeFavorites(favorites: Favorites): Promise<void> {
  await Bun.write(FAVORITES_PATH, JSON.stringify(favorites, null, 2))
}

export async function toggleFavoriteProject(slug: string): Promise<Favorites> {
  const favs = await getFavorites()
  const idx = favs.projects.indexOf(slug)
  if (idx >= 0) favs.projects.splice(idx, 1)
  else favs.projects.push(slug)
  await writeFavorites(favs)
  return favs
}

export async function toggleFavoriteSession(id: string): Promise<Favorites> {
  const favs = await getFavorites()
  const idx = favs.sessions.indexOf(id)
  if (idx >= 0) favs.sessions.splice(idx, 1)
  else favs.sessions.push(id)
  await writeFavorites(favs)
  return favs
}

// --- Session parsing helper (shared between listSessions and getRecentSessions) ---

function parseSessionFromContent(
  content: string,
  id: string,
  mtime: number,
  activeIds: Set<string>,
  resumeCommand: string,
): SessionMeta | null {
  const lines = content.trim().split("\n")
  if (lines.length === 0) return null

  let firstPrompt = ""
  let timestamp = ""
  let model = ""
  let gitBranch = ""
  let turns = 0
  let cost = 0

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as RawJSONLLine
      if (isUserLine(parsed)) {
        turns++
        if (!firstPrompt) {
          const text = getTextFromContent(parsed.message.content)
          if (text) firstPrompt = text.slice(0, 200)
          timestamp = parsed.timestamp
          gitBranch = parsed.gitBranch ?? ""
        }
      } else if (isAssistantLine(parsed)) {
        if (!model) model = parsed.message.model
        const usage = parsed.message.usage
        if (usage) {
          cost += ((usage.input_tokens ?? 0) * 3 + (usage.output_tokens ?? 0) * 15) / 1_000_000
        }
      }
    } catch {}
  }

  if (!firstPrompt) return null

  return {
    id,
    firstPrompt,
    timestamp,
    model,
    turns,
    cost: Math.round(cost * 10000) / 10000,
    gitBranch,
    isActive: activeIds.has(id),
    lastModified: new Date(mtime).toISOString(),
    resumeCommand,
  }
}

// --- Recent sessions aggregator ---

export async function getRecentSessions(limit = 20): Promise<RecentSession[]> {
  let projectDirs: string[]
  try {
    projectDirs = await readdir(CLAUDE_PROJECTS_DIR)
  } catch {
    return []
  }

  // Phase 1: stat-first — collect (file, mtime, projectSlug) tuples
  const tuples: { filePath: string; mtime: number; slug: string; id: string }[] = []

  await Promise.all(
    projectDirs.map(async (slug) => {
      const dir = join(CLAUDE_PROJECTS_DIR, slug)
      const s = await stat(dir).catch(() => null)
      if (!s?.isDirectory()) return

      const files = await readdir(dir).catch(() => [] as string[])
      const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"))

      await Promise.all(
        jsonlFiles.map(async (f) => {
          const filePath = join(dir, f)
          const fStat = await stat(filePath).catch(() => null)
          if (fStat) {
            tuples.push({
              filePath,
              mtime: fStat.mtimeMs,
              slug,
              id: f.replace(".jsonl", ""),
            })
          }
        })
      )
    })
  )

  // Sort by mtime desc, take top N
  tuples.sort((a, b) => b.mtime - a.mtime)
  const topN = tuples.slice(0, limit)

  // Phase 2: parse only top N
  const activeIds = await getRunningSessionIds()
  const results: RecentSession[] = []

  await Promise.all(
    topN.map(async ({ filePath, mtime, slug, id }) => {
      try {
        const content = await readFile(filePath, "utf-8")
        const projectPath = decodeSlug(slug)
        const resumeCommand = `cd ${projectPath} && claude --resume ${id}`
        const session = parseSessionFromContent(content, id, mtime, activeIds, resumeCommand)
        if (session) {
          results.push({ ...session, projectSlug: slug, projectPath })
        }
      } catch {}
    })
  )

  // Re-sort since parallel parsing may have scrambled order
  results.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())

  return results
}

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

  projects.sort((a, b) => {
    if (!a.lastActive) return 1
    if (!b.lastActive) return -1
    return b.lastActive.localeCompare(a.lastActive)
  })

  return projects
}

export async function listSessions(slug: string): Promise<SessionMeta[]> {
  const dir = join(CLAUDE_PROJECTS_DIR, slug)
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return []
  }

  const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"))

  const fileStats = await Promise.all(
    jsonlFiles.map(async (f) => {
      const fStat = await stat(join(dir, f)).catch(() => null)
      return { file: f, mtime: fStat?.mtimeMs ?? 0 }
    })
  )
  fileStats.sort((a, b) => b.mtime - a.mtime)

  const activeIds = await getRunningSessionIds()
  const projectPath = decodeSlug(slug)
  const sessions: SessionMeta[] = []

  for (const { file, mtime } of fileStats) {
    const id = file.replace(".jsonl", "")
    const filePath = join(dir, file)

    try {
      const content = await readFile(filePath, "utf-8")
      const resumeCommand = `cd ${projectPath} && claude --resume ${id}`
      const session = parseSessionFromContent(content, id, mtime, activeIds, resumeCommand)
      if (session) sessions.push(session)
    } catch {}
  }

  return sessions
}

export async function getSessionMessages(slug: string, sessionId: string): Promise<ParsedMessage[]> {
  const filePath = join(CLAUDE_PROJECTS_DIR, slug, `${sessionId}.jsonl`)

  let content: string
  try {
    content = await readFile(filePath, "utf-8")
  } catch {
    return []
  }

  const lines = content.trim().split("\n")
  const messages: ParsedMessage[] = []

  const toolResults = new Map<string, { content: string; is_error?: boolean }>()
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as RawJSONLLine
      if (isUserLine(parsed)) {
        const msgContent = parsed.message.content
        if (typeof msgContent === "string") continue
        for (const block of msgContent) {
          if (block.type === "tool_result") {
            toolResults.set(block.tool_use_id, {
              content: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
              is_error: block.is_error,
            })
          }
        }
      }
    } catch {}
  }

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as RawJSONLLine
      if (isUserLine(parsed)) {
        const msgContent = parsed.message.content
        if (typeof msgContent === "string") {
          messages.push({
            role: "user",
            content: [{ type: "text" as const, text: msgContent, citations: null }],
            timestamp: parsed.timestamp,
            uuid: parsed.uuid,
          })
          continue
        }
        const textBlocks: ContentBlock[] = []
        for (const b of msgContent) {
          if (b.type === "text") textBlocks.push({ type: "text" as const, text: b.text, citations: null })
        }
        if (textBlocks.length === 0) continue

        messages.push({
          role: "user",
          content: textBlocks,
          timestamp: parsed.timestamp,
          uuid: parsed.uuid,
        })
      } else if (isAssistantLine(parsed)) {
        const enrichedContent: ContentBlock[] = []
        for (const block of parsed.message.content) {
          if (block.type === "tool_use") {
            const result = toolResults.get(block.id)
            enrichedContent.push({
              type: "tool_use",
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
              ...(result ? { output: result.content, is_error: result.is_error } : {}),
            })
          } else if (block.type === "text") {
            enrichedContent.push({ type: "text" as const, text: block.text, citations: block.citations ?? null })
          }
        }

        messages.push({
          role: "assistant",
          content: enrichedContent,
          timestamp: parsed.timestamp,
          uuid: parsed.uuid,
          model: parsed.message.model,
        })
      }
    } catch {}
  }

  return messages
}
