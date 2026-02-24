import {
  readdir,
  stat,
  readFile,
  mkdir,
  writeFile,
  rm,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname, isAbsolute } from "node:path";

import type {
  Project,
  SessionMeta,
  RecentSession,
  ParsedMessage,
  ContentBlock,
  RawJSONLLine,
  RawUserMessage,
  RawAssistantMessage,
  SessionState,
} from "./types";

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
const CLAUDE_PROJECTS_DIR = join(CLAUDE_DIR, "projects");
const USER_HOME = process.env.CLAUDE_CONFIG_DIR
  ? dirname(process.env.CLAUDE_CONFIG_DIR)
  : homedir();
const CLAUDE_CONFIG_PATH = join(CLAUDE_DIR, ".claude.json");
const STATS_CACHE_PATH = join(CLAUDE_DIR, "stats-cache.json");
const FACETS_DIR = join(CLAUDE_DIR, "usage-data", "facets");

function isUserLine(line: RawJSONLLine): line is RawUserMessage {
  return line.type === "user";
}

function isAssistantLine(line: RawJSONLLine): line is RawAssistantMessage {
  return line.type === "assistant";
}

// --- Session state inference ---

const TAIL_BYTES = 4096;

export async function inferSessionState(
  filePath: string,
  mtimeMs: number
): Promise<SessionState> {
  try {
    const file = Bun.file(filePath);
    const size = file.size;
    if (size === 0) return "empty";

    const offset = Math.max(0, size - TAIL_BYTES);
    const tail = await file.slice(offset, size).text();
    const lines = tail.trim().split("\n");

    // Parse from the end to find last valid JSON line
    let lastLine: Record<string, unknown> | null = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        lastLine = JSON.parse(lines[i]);
        break;
      } catch {}
    }

    if (!lastLine) return "empty";

    const type = lastLine.type as string;
    const subtype = lastLine.subtype as string | undefined;
    let state: SessionState = "idle";

    if (type === "file-history-snapshot") {
      state = "empty";
    } else if (
      type === "system" &&
      (subtype === "turn_duration" || subtype === "stop_hook_summary")
    ) {
      state = "idle";
    } else if (type === "queue-operation" && lastLine.operation === "remove") {
      state = "idle";
    } else if (type === "assistant") {
      const msg = lastLine.message as Record<string, unknown> | undefined;
      const content = msg?.content as Array<{ type: string }> | undefined;
      const hasToolUse = content?.some((c) => c.type === "tool_use") ?? false;
      state = hasToolUse ? "active" : "idle";
    } else if (type === "progress") {
      state = "active";
    } else if (type === "user") {
      const msg = lastLine.message as Record<string, unknown> | undefined;
      const content = msg?.content;
      if (
        Array.isArray(content) &&
        content.every((c: { type: string }) => c.type === "tool_result")
      ) {
        state = "active";
      } else {
        // User typed text but no response yet — could be crash or waiting
        state = "active";
      }
    }

    // Staleness check: if "active" but file not modified in 30s, it's stale
    if (state === "active") {
      const ageMs = Date.now() - mtimeMs;
      if (ageMs > 30_000) state = "stale";
    }

    return state;
  } catch {
    return "empty";
  }
}

// --- ~/.claude.json config ---

interface ClaudeConfigProject {
  lastSessionId?: string;
  lastCost?: number;
  lastDuration?: number;
  lastLinesAdded?: number;
  lastLinesRemoved?: number;
  lastTotalInputTokens?: number;
  lastTotalOutputTokens?: number;
  lastTotalCacheCreationInputTokens?: number;
  lastTotalCacheReadInputTokens?: number;
  lastModelUsage?: Record<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens?: number;
      cacheCreationInputTokens?: number;
      costUSD: number;
    }
  >;
  hasTrustDialogAccepted?: boolean;
  mcpServers?: Record<string, unknown>;
}

interface ClaudeConfig {
  projects: Record<string, ClaudeConfigProject>;
  mcpServers: Record<string, unknown>;
}

let configCache: { data: ClaudeConfig; mtime: number } | null = null;

export async function readClaudeConfig(): Promise<ClaudeConfig> {
  const fStat = await stat(CLAUDE_CONFIG_PATH).catch(() => null);
  if (!fStat) return { projects: {}, mcpServers: {} };

  if (configCache && configCache.mtime === fStat.mtimeMs)
    return configCache.data;

  try {
    const data = JSON.parse(await readFile(CLAUDE_CONFIG_PATH, "utf-8"));
    const result = {
      projects: data.projects ?? {},
      mcpServers: data.mcpServers ?? {},
    };
    configCache = { data: result, mtime: fStat.mtimeMs };
    return result;
  } catch {
    return { projects: {}, mcpServers: {} };
  }
}

// --- Slug ↔ path resolution via .claude.json + actual disk directories ---

// Strip all non-alphanumeric chars for comparison
function normalize(s: string): string {
  return s.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

let _slugToPath: Map<string, string> | null = null;
let _pathToSlug: Map<string, string> | null = null;

async function buildSlugMaps() {
  if (_slugToPath && _pathToSlug)
    return { slugToPath: _slugToPath, pathToSlug: _pathToSlug };

  const config = await readClaudeConfig();
  _slugToPath = new Map();
  _pathToSlug = new Map();

  const dirs = await readdir(CLAUDE_PROJECTS_DIR).catch(() => [] as string[]);

  for (const configPath of Object.keys(config.projects)) {
    const norm = normalize(configPath);
    const matchingDir = dirs.find((d) => normalize(d) === norm);
    const slug = matchingDir ?? configPath.replace(/[^a-zA-Z0-9-]/g, "-");
    _slugToPath.set(slug, configPath);
    _pathToSlug.set(configPath, slug);
  }

  for (const dir of dirs) {
    if (!_slugToPath.has(dir)) {
      _slugToPath.set(dir, dir);
    }
  }

  return { slugToPath: _slugToPath, pathToSlug: _pathToSlug };
}

export function invalidateSlugCache() {
  _slugToPath = null;
  _pathToSlug = null;
}

export async function resolveSlugToPath(slug: string): Promise<string> {
  const { slugToPath } = await buildSlugMaps();
  return (
    slugToPath.get(slug) ?? "/" + slug.replace(/^-/, "").replace(/-/g, "/")
  );
}

async function getSlugForPath(path: string): Promise<string> {
  const { pathToSlug } = await buildSlugMaps();
  return pathToSlug.get(path) ?? path.replace(/[^a-zA-Z0-9-]/g, "-");
}

// Exported for tmux.ts — resolves a cwd to its project slug
export async function resolveSlugForCwd(cwd: string): Promise<string> {
  return getSlugForPath(cwd);
}

function getTextFromContent(
  content: RawUserMessage["message"]["content"]
): string | undefined {
  if (typeof content === "string") return content;
  const textBlock = content.find((b) => b.type === "text");
  if (textBlock && "text" in textBlock) return textBlock.text;
  return undefined;
}

// --- Session parsing helpers ---

const HEAD_BYTES = 8192; // enough for first few messages

function parseSessionHead(
  content: string,
  id: string,
  mtime: number,
  fileSize: number,
  resumeCommand: string
): SessionMeta | null {
  const allLines = content.trim().split("\n");
  // Drop last line if content was truncated (partial JSON)
  const lines = content.length >= HEAD_BYTES ? allLines.slice(0, -1) : allLines;
  if (lines.length === 0) return null;

  let firstPrompt = "";
  let timestamp = "";
  let model = "";
  let gitBranch = "";

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as RawJSONLLine;
      if (isUserLine(parsed) && !firstPrompt) {
        const text = getTextFromContent(parsed.message.content);
        if (text) firstPrompt = text.slice(0, 200);
        timestamp = parsed.timestamp;
        gitBranch = parsed.gitBranch ?? "";
      } else if (isAssistantLine(parsed) && !model) {
        model = parsed.message.model;
      }
    } catch {}
    if (firstPrompt && model) break;
  }

  if (!firstPrompt) return null;

  return {
    id,
    firstPrompt,
    timestamp,
    model,
    gitBranch,
    lastModified: new Date(mtime).toISOString(),
    resumeCommand,
  };
}

// --- Git remote URL ---

export async function getGitRemoteUrl(
  projectPath: string
): Promise<string | null> {
  try {
    const result =
      await Bun.$`git -C ${projectPath} config --get remote.origin.url`.text();
    let url = result.trim();
    if (!url) return null;
    // Normalize git@github.com:user/repo.git -> https://github.com/user/repo
    if (url.startsWith("git@")) {
      url = url.replace(/^git@([^:]+):/, "https://$1/").replace(/\.git$/, "");
    } else if (url.endsWith(".git")) {
      url = url.replace(/\.git$/, "");
    }
    return url;
  } catch {
    return null;
  }
}

// --- Project list using ~/.claude.json + 1 stat per project for lastActive ---

export async function listProjects(): Promise<Project[]> {
  const config = await readClaudeConfig();
  const projects = await Promise.all(
    Object.entries(config.projects).map(async ([path, meta]) => {
      const slug = await getSlugForPath(path);
      let lastActive: string | undefined;
      if (meta.lastSessionId) {
        const filePath = join(
          CLAUDE_PROJECTS_DIR,
          slug,
          `${meta.lastSessionId}.jsonl`
        );
        const fStat = await stat(filePath).catch(() => null);
        if (fStat) lastActive = new Date(fStat.mtimeMs).toISOString();
      }
      const gitRemoteUrl = await getGitRemoteUrl(path);
      return {
        slug,
        path,
        lastActive,
        gitRemoteUrl,
        lastCost: meta.lastCost,
        lastDuration: meta.lastDuration,
        lastLinesAdded: meta.lastLinesAdded,
        lastLinesRemoved: meta.lastLinesRemoved,
        lastTotalInputTokens: meta.lastTotalInputTokens,
        lastTotalOutputTokens: meta.lastTotalOutputTokens,
        lastSessionId: meta.lastSessionId,
        lastModelUsage: meta.lastModelUsage,
      } satisfies Project;
    })
  );

  projects.sort((a, b) => {
    if (!a.lastActive) return 1;
    if (!b.lastActive) return -1;
    return b.lastActive.localeCompare(a.lastActive);
  });

  return projects;
}

// --- Recent sessions using lastSessionId from ~/.claude.json ---

export async function getRecentSessions(limit = 20): Promise<RecentSession[]> {
  const config = await readClaudeConfig();
  const entries = Object.entries(config.projects).filter(
    ([_, meta]) => meta.lastSessionId
  );

  const results = await Promise.all(
    entries.map(async ([path, meta]) => {
      const slug = await getSlugForPath(path);
      const filePath = join(
        CLAUDE_PROJECTS_DIR,
        slug,
        `${meta.lastSessionId}.jsonl`
      );
      try {
        const fStat = await stat(filePath).catch(() => null);
        if (!fStat) return null;
        const handle = Bun.file(filePath);
        const content = await handle.slice(0, HEAD_BYTES).text();
        const resumeCommand = `cd ${path} && claude --resume ${meta.lastSessionId}`;
        const session = parseSessionHead(
          content,
          meta.lastSessionId!,
          fStat.mtimeMs,
          fStat.size,
          resumeCommand
        );
        if (session) {
          const sessionState = await inferSessionState(filePath, fStat.mtimeMs);
          return {
            ...session,
            projectSlug: slug,
            projectPath: path,
            sessionState,
          };
        }
      } catch {}
      return null;
    })
  );

  return results
    .filter((s) => s !== null)
    .sort(
      (a, b) =>
        new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    )
    .slice(0, limit);
}

export async function listSessions(
  slug: string,
  limit?: number
): Promise<SessionMeta[]> {
  const dir = join(CLAUDE_PROJECTS_DIR, slug);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

  const fileStats = await Promise.all(
    jsonlFiles.map(async (f) => {
      const fStat = await stat(join(dir, f)).catch(() => null);
      return { file: f, mtime: fStat?.mtimeMs ?? 0, size: fStat?.size ?? 0 };
    })
  );
  fileStats.sort((a, b) => b.mtime - a.mtime);

  // Default to 30 most recent — UI sorts by mtime so we already have newest first
  const page = fileStats.slice(0, limit ?? 30);

  const projectPath = await resolveSlugToPath(slug);

  const results = await Promise.all(
    page.map(async ({ file, mtime, size }) => {
      const id = file.replace(".jsonl", "");
      const filePath = join(dir, file);
      const resumeCommand = `cd ${projectPath} && claude --resume ${id}`;
      try {
        const handle = Bun.file(filePath);
        const content = await handle.slice(0, HEAD_BYTES).text();
        const meta = parseSessionHead(content, id, mtime, size, resumeCommand);
        if (!meta) return null;
        // Skip full inference for sessions older than 5 min — they're definitively idle
        const ageMs = Date.now() - mtime;
        const sessionState: SessionState =
          ageMs > 300_000 ? "idle" : await inferSessionState(filePath, mtime);
        return { ...meta, sessionState };
      } catch {
        return null;
      }
    })
  );

  return results.filter((s) => s !== null);
}

// --- Root workspace sessions (resolved from USER_HOME slug) ---

export async function listRootSessions(limit?: number): Promise<SessionMeta[]> {
  const slug = await getSlugForPath(USER_HOME);
  return listSessions(slug, limit);
}

// --- Project config reading ---

export async function readProjectMcpConfig(
  projectPath: string
): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(join(projectPath, ".mcp.json"), "utf-8");
    const parsed = JSON.parse(content);
    return parsed?.mcpServers ?? null;
  } catch {
    return null;
  }
}

export async function readUserMcpServers(): Promise<Record<string, unknown>> {
  const config = await readClaudeConfig();
  return config.mcpServers;
}

export async function readLocalMcpServers(
  projectPath: string
): Promise<Record<string, unknown>> {
  const config = await readClaudeConfig();
  return config.projects[projectPath]?.mcpServers ?? {};
}

export async function readProjectClaudeMd(
  projectPath: string
): Promise<string | null> {
  try {
    return await readFile(join(projectPath, "CLAUDE.md"), "utf-8");
  } catch {
    return null;
  }
}

export interface ProjectAgent {
  name: string;
  description: string;
  model?: string;
  tools?: string;
}

export async function readProjectAgents(
  projectPath: string
): Promise<ProjectAgent[]> {
  const agentsDir = join(projectPath, ".claude", "agents");
  let files: string[];
  try {
    files = await readdir(agentsDir);
  } catch {
    return [];
  }

  const agents: ProjectAgent[] = [];
  for (const f of files.filter((f) => f.endsWith(".md"))) {
    try {
      const content = await readFile(join(agentsDir, f), "utf-8");
      // Parse YAML frontmatter between --- delimiters
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (!match) continue;
      const frontmatter = match[1];
      const get = (key: string) =>
        frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim();
      agents.push({
        name: get("name") ?? f.replace(".md", ""),
        description: get("description") ?? "",
        model: get("model"),
        tools: get("tools"),
      });
    } catch {}
  }
  return agents;
}

// --- Skills & Commands ---

export interface SkillInfo {
  name: string;
  description: string;
  scope: "user" | "project";
  type: "skill" | "command";
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = match[1];
  const result: Record<string, string> = {};
  for (const line of fm.split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv) result[kv[1]] = kv[2].trim();
  }
  return result;
}

export async function readUserSkills(): Promise<SkillInfo[]> {
  const skillsDir = join(CLAUDE_DIR, "skills");
  let dirs: string[];
  try {
    dirs = await readdir(skillsDir);
  } catch {
    return [];
  }

  const skills: SkillInfo[] = [];
  for (const d of dirs) {
    try {
      const skillMd = join(skillsDir, d, "SKILL.md");
      const content = await readFile(skillMd, "utf-8");
      const fm = parseFrontmatter(content);
      skills.push({
        name: fm.name ?? d,
        description: fm.description ?? "",
        scope: "user",
        type: "skill",
      });
    } catch {}
  }
  return skills;
}

export async function readUserCommands(): Promise<SkillInfo[]> {
  const cmdsDir = join(CLAUDE_DIR, "commands");
  let files: string[];
  try {
    files = await readdir(cmdsDir);
  } catch {
    return [];
  }

  const cmds: SkillInfo[] = [];
  for (const f of files.filter((f) => f.endsWith(".md"))) {
    try {
      const content = await readFile(join(cmdsDir, f), "utf-8");
      const fm = parseFrontmatter(content);
      cmds.push({
        name: f.replace(".md", ""),
        description: fm.description ?? "",
        scope: "user",
        type: "command",
      });
    } catch {}
  }
  return cmds;
}

export async function readProjectCommands(
  projectPath: string
): Promise<SkillInfo[]> {
  const cmdsDir = join(projectPath, ".claude", "commands");
  let files: string[];
  try {
    files = await readdir(cmdsDir);
  } catch {
    return [];
  }

  const cmds: SkillInfo[] = [];
  for (const f of files.filter((f) => f.endsWith(".md"))) {
    try {
      const content = await readFile(join(cmdsDir, f), "utf-8");
      const fm = parseFrontmatter(content);
      cmds.push({
        name: f.replace(".md", ""),
        description: fm.description ?? "",
        scope: "project",
        type: "command",
      });
    } catch {}
  }
  return cmds;
}

// --- File content reading ---

const MAX_PREVIEW_SIZE = 100 * 1024; // 100KB

export async function readFileContent(
  projectPath: string,
  filePath: string
): Promise<{ content: string; size: number }> {
  // Security: prevent path traversal
  if (filePath.includes("..")) throw new Error("Invalid path");
  const fullPath = join(projectPath, filePath);
  // Ensure it's within project root
  if (!fullPath.startsWith(projectPath)) throw new Error("Invalid path");

  const file = Bun.file(fullPath);
  const size = file.size;
  if (size > MAX_PREVIEW_SIZE) throw new Error("File too large for preview");
  const content = await file.text();
  return { content, size };
}

// --- Directory listing ---

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", ".turbo"]);

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  size: number;
}

export async function listDirectory(
  dirPath: string,
  subpath?: string
): Promise<DirEntry[]> {
  const target = subpath ? join(dirPath, subpath) : dirPath;
  const entries = await readdir(target, { withFileTypes: true });

  const filtered = entries.filter((e) => !SKIP_DIRS.has(e.name));
  const results = await Promise.all(
    filtered.map(async (entry) => {
      const isDir = entry.isDirectory();
      const size = isDir ? 0 : Bun.file(join(target, entry.name)).size;
      return { name: entry.name, isDirectory: isDir, size };
    })
  );

  // dirs first, then files, alphabetical within each group
  results.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return results;
}

// --- Directory creation ---

export async function createDirectory(
  projectPath: string,
  subpath: string | undefined,
  name: string
): Promise<void> {
  if (
    name.includes("..") ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0")
  )
    throw new Error("Invalid directory name");
  if (subpath?.includes("..")) throw new Error("Invalid subpath");

  const fullPath = join(projectPath, subpath ?? "", name);
  if (!fullPath.startsWith(projectPath))
    throw new Error("Path traversal rejected");

  await mkdir(fullPath);
}

export async function createProjectDirectory(
  parentDir: string,
  projectName: string
): Promise<string> {
  if (!isAbsolute(parentDir))
    throw new Error("Parent directory must be absolute");
  if (
    projectName.includes("/") ||
    projectName.includes("\\") ||
    projectName.includes("\0") ||
    projectName.includes("..")
  )
    throw new Error("Invalid project name");

  const fullPath = join(parentDir, projectName);
  await mkdir(fullPath, { recursive: true });
  return fullPath;
}

export async function getSessionMessages(
  slug: string,
  sessionId: string
): Promise<ParsedMessage[]> {
  const filePath = join(CLAUDE_PROJECTS_DIR, slug, `${sessionId}.jsonl`);

  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return [];
  }

  const lines = content.trim().split("\n");
  const messages: ParsedMessage[] = [];

  const toolResults = new Map<
    string,
    { content: string; is_error?: boolean }
  >();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as RawJSONLLine;
      if (isUserLine(parsed)) {
        const msgContent = parsed.message.content;
        if (typeof msgContent === "string") continue;
        for (const block of msgContent) {
          if (block.type === "tool_result") {
            toolResults.set(block.tool_use_id, {
              content:
                typeof block.content === "string"
                  ? block.content
                  : JSON.stringify(block.content),
              is_error: block.is_error,
            });
          }
        }
      }
    } catch {}
  }

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as RawJSONLLine;
      if (isUserLine(parsed)) {
        const msgContent = parsed.message.content;
        if (typeof msgContent === "string") {
          messages.push({
            role: "user",
            content: [
              { type: "text" as const, text: msgContent, citations: null },
            ],
            timestamp: parsed.timestamp,
            uuid: parsed.uuid,
          });
          continue;
        }
        const textBlocks: ContentBlock[] = [];
        for (const b of msgContent) {
          if (b.type === "text")
            textBlocks.push({
              type: "text" as const,
              text: b.text,
              citations: null,
            });
        }
        if (textBlocks.length === 0) continue;

        messages.push({
          role: "user",
          content: textBlocks,
          timestamp: parsed.timestamp,
          uuid: parsed.uuid,
        });
      } else if (isAssistantLine(parsed)) {
        const enrichedContent: ContentBlock[] = [];
        for (const block of parsed.message.content) {
          if (block.type === "tool_use") {
            const result = toolResults.get(block.id);
            enrichedContent.push({
              type: "tool_use",
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
              ...(result
                ? { output: result.content, is_error: result.is_error }
                : {}),
            });
          } else if (block.type === "text") {
            enrichedContent.push({
              type: "text" as const,
              text: block.text,
              citations: block.citations ?? null,
            });
          }
        }

        messages.push({
          role: "assistant",
          content: enrichedContent,
          timestamp: parsed.timestamp,
          uuid: parsed.uuid,
          model: parsed.message.model,
        });
      }
    } catch {}
  }

  return messages;
}

// --- Analytics: global stats from ~/.claude.json ---

interface GlobalStatsResult {
  numStartups: number;
  firstStartTime: string;
  promptQueueUseCount: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  skillUsage: { name: string; usageCount: number; lastUsedAt: number }[];
}

export async function readGlobalStats(): Promise<GlobalStatsResult> {
  const raw = await readFile(CLAUDE_CONFIG_PATH, "utf-8").catch(() => "{}");
  const data = JSON.parse(raw);

  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalLinesAdded = 0;
  let totalLinesRemoved = 0;

  const projects: Record<string, ClaudeConfigProject> = data.projects ?? {};
  for (const meta of Object.values(projects)) {
    totalCost += meta.lastCost ?? 0;
    totalInputTokens += meta.lastTotalInputTokens ?? 0;
    totalOutputTokens += meta.lastTotalOutputTokens ?? 0;
    totalLinesAdded += meta.lastLinesAdded ?? 0;
    totalLinesRemoved += meta.lastLinesRemoved ?? 0;
  }

  const skillUsage: GlobalStatsResult["skillUsage"] = [];
  const rawSkills: Record<string, { usageCount: number; lastUsedAt: number }> =
    data.skillUsage ?? {};
  for (const [name, entry] of Object.entries(rawSkills)) {
    skillUsage.push({
      name,
      usageCount: entry.usageCount,
      lastUsedAt: entry.lastUsedAt,
    });
  }
  skillUsage.sort((a, b) => b.usageCount - a.usageCount);

  return {
    numStartups: data.numStartups ?? 0,
    firstStartTime: data.firstStartTime ?? "",
    promptQueueUseCount: data.promptQueueUseCount ?? 0,
    totalCost,
    totalInputTokens,
    totalOutputTokens,
    totalLinesAdded,
    totalLinesRemoved,
    skillUsage,
  };
}

// --- Analytics: daily activity from stats-cache.json ---

interface DailyActivityEntry {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export async function readStatsCache(): Promise<DailyActivityEntry[]> {
  try {
    const raw = await readFile(STATS_CACHE_PATH, "utf-8");
    const data = JSON.parse(raw);
    return (data.dailyActivity ?? []) as DailyActivityEntry[];
  } catch {
    return [];
  }
}

// --- Analytics: session facets ---

interface SessionFacetResult {
  sessionId: string;
  outcome?: string;
  helpfulness?: string;
  briefSummary?: string;
  sessionType?: string;
  frictionCounts?: Record<string, number>;
}

export async function readSessionFacets(
  sessionIds: string[]
): Promise<SessionFacetResult[]> {
  const results: SessionFacetResult[] = [];

  await Promise.all(
    sessionIds.map(async (id) => {
      const filePath = join(FACETS_DIR, `${id}.json`);
      try {
        const raw = await readFile(filePath, "utf-8");
        const data = JSON.parse(raw);
        results.push({
          sessionId: id,
          outcome: data.outcome,
          helpfulness: data.claude_helpfulness,
          briefSummary: data.brief_summary,
          sessionType: data.session_type,
          frictionCounts: data.friction_counts,
        });
      } catch {
        // No facet for this session
      }
    })
  );

  return results;
}

// --- CLI helper ---

export async function runClaudeCli(
  args: string[],
  cwd?: string
): Promise<{ success: boolean; output?: string; error?: string }> {
  try {
    const proc = Bun.spawn(["claude", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      return {
        success: false,
        error: stderr || stdout || `Exit code ${exitCode}`,
      };
    }
    // Invalidate config cache after CLI mutation
    configCache = null;
    return { success: true, output: stdout };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "CLI execution failed",
    };
  }
}

// --- MCP Tool Inspection ---

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: object;
}

export interface McpServerConfig {
  type?: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export async function inspectMcpTools(
  serverConfig: McpServerConfig
): Promise<McpTool[]> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const transport = serverConfig.type ?? "stdio";

  const mcpClient = new Client({ name: "claude-explorer", version: "1.0.0" });

  let mcpTransport: unknown;

  if (transport === "stdio") {
    const { StdioClientTransport } =
      await import("@modelcontextprotocol/sdk/client/stdio.js");
    if (!serverConfig.command)
      throw new Error("No command specified for stdio server");
    mcpTransport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args ?? [],
      env: serverConfig.env
        ? ({ ...process.env, ...serverConfig.env } as Record<string, string>)
        : undefined,
    });
  } else if (transport === "http") {
    const { StreamableHTTPClientTransport } =
      await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    if (!serverConfig.url) throw new Error("No URL specified for http server");
    mcpTransport = new StreamableHTTPClientTransport(new URL(serverConfig.url));
  } else if (transport === "sse") {
    const { SSEClientTransport } =
      await import("@modelcontextprotocol/sdk/client/sse.js");
    if (!serverConfig.url) throw new Error("No URL specified for sse server");
    mcpTransport = new SSEClientTransport(new URL(serverConfig.url));
  } else {
    throw new Error(`Unsupported transport: ${transport}`);
  }

  try {
    await Promise.race([
      mcpClient.connect(
        mcpTransport as Parameters<typeof mcpClient.connect>[0]
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout")), 10000)
      ),
    ]);

    const result = await Promise.race([
      mcpClient.listTools(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("listTools timeout")), 5000)
      ),
    ]);

    return (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as object | undefined,
    }));
  } finally {
    try {
      await mcpClient.close();
    } catch {
      // best-effort cleanup
    }
  }
}

// --- Skill / Command writes ---

export async function writeUserSkill(
  name: string,
  content: string
): Promise<void> {
  const dir = join(CLAUDE_DIR, "skills", name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), content, "utf-8");
}

export async function removeUserSkill(name: string): Promise<boolean> {
  const dir = join(CLAUDE_DIR, "skills", name);
  try {
    await rm(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export async function writeUserCommand(
  name: string,
  content: string
): Promise<void> {
  const dir = join(CLAUDE_DIR, "commands");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${name}.md`), content, "utf-8");
}

export async function removeUserCommand(name: string): Promise<boolean> {
  try {
    await rm(join(CLAUDE_DIR, "commands", `${name}.md`));
    return true;
  } catch {
    return false;
  }
}

export async function writeProjectCommand(
  projectPath: string,
  name: string,
  content: string
): Promise<void> {
  const dir = join(projectPath, ".claude", "commands");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${name}.md`), content, "utf-8");
}

export async function removeProjectCommand(
  projectPath: string,
  name: string
): Promise<boolean> {
  try {
    await rm(join(projectPath, ".claude", "commands", `${name}.md`));
    return true;
  } catch {
    return false;
  }
}

export async function readSkillContent(name: string): Promise<string | null> {
  try {
    return await readFile(
      join(CLAUDE_DIR, "skills", name, "SKILL.md"),
      "utf-8"
    );
  } catch {
    return null;
  }
}

export async function readCommandContent(
  scope: "user" | "project",
  name: string,
  projectPath?: string
): Promise<string | null> {
  try {
    const base =
      scope === "user"
        ? join(CLAUDE_DIR, "commands")
        : join(projectPath!, ".claude", "commands");
    return await readFile(join(base, `${name}.md`), "utf-8");
  } catch {
    return null;
  }
}
