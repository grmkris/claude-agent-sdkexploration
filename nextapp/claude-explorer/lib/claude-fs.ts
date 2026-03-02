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
  ParsedMessage,
  ContentBlock,
  RawJSONLLine,
  RawUserMessage,
  RawAssistantMessage,
} from "./types";

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
const CLAUDE_PROJECTS_DIR = join(CLAUDE_DIR, "projects");
export const USER_HOME = process.env.CLAUDE_CONFIG_DIR
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
  env?: Record<string, string>;
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

let _slugToPath: Map<string, string> | null = null;
let _pathToSlug: Map<string, string> | null = null;

async function buildSlugMaps() {
  if (_slugToPath && _pathToSlug)
    return { slugToPath: _slugToPath, pathToSlug: _pathToSlug };

  const config = await readClaudeConfig();
  _slugToPath = new Map();
  _pathToSlug = new Map();

  const dirs = await readdir(CLAUDE_PROJECTS_DIR).catch(() => [] as string[]);

  // First pass: map every registered config path to its canonical slug.
  // The slug is derived by the same sanitisation the Claude CLI uses when
  // creating the on-disk directory (replace non-alphanumeric with "-").
  // We prefer the actual disk directory name when it exists so that slug
  // round-trips are exact, but the sanitised form is identical either way.
  for (const configPath of Object.keys(config.projects)) {
    const expectedDirName = configPath.replace(/[^a-zA-Z0-9-]/g, "-");
    // Verify the directory actually exists on disk (preferred) but fall back
    // to the expected name so newly-registered projects work immediately.
    const matchingDir = dirs.find((d) => d === expectedDirName);
    const slug = matchingDir ?? expectedDirName;
    _slugToPath.set(slug, configPath);
    _pathToSlug.set(configPath, slug);
  }

  // Second pass: handle on-disk directories that have no entry in config yet
  // (projects used before being registered, or deleted from .claude.json).
  for (const dir of dirs) {
    if (_slugToPath.has(dir)) continue;

    // Try a reverse-lookup: if this dir's name matches the canonical slug of
    // any registered config path, use that path (avoids lossy conversion).
    const matchedConfigPath = Object.keys(config.projects).find(
      (p) => p.replace(/[^a-zA-Z0-9-]/g, "-") === dir
    );
    if (matchedConfigPath) {
      // Shouldn't normally reach here (first pass covers this), but guard
      // against edge cases like concurrent config writes.
      _slugToPath.set(dir, matchedConfigPath);
      if (!_pathToSlug.has(matchedConfigPath))
        _pathToSlug.set(matchedConfigPath, dir);
    } else {
      // Truly orphan directory — reconstruct path best-effort.
      // NOTE: This conversion is lossy for project names that contain
      // hyphens (e.g. "agent-sdk-test" ↔ "agent/sdk/test"). There is no
      // lossless way to reverse the Claude CLI's sanitisation without the
      // original path. Register the project in ~/.claude.json to fix this.
      const reconstructedPath = "/" + dir.replace(/^-/, "").replace(/-/g, "/");
      _slugToPath.set(dir, reconstructedPath);
      // Also populate the reverse map so resolveSlugForCwd() returns the
      // correct slug instead of falling through to a parent path match.
      if (!_pathToSlug.has(reconstructedPath))
        _pathToSlug.set(reconstructedPath, dir);
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

  // 1. Exact match — covers the vast majority of cases.
  if (pathToSlug.has(path)) return pathToSlug.get(path)!;

  // 2. Longest-prefix match — handles sessions started from a sub-directory
  //    of a registered project (e.g. /home/bun/projects/foo/src → slug for
  //    /home/bun/projects/foo).
  let best: { projectPath: string; slug: string } | null = null;
  for (const [projectPath, slug] of pathToSlug) {
    if (
      path.startsWith(projectPath + "/") &&
      (!best || projectPath.length > best.projectPath.length)
    ) {
      best = { projectPath, slug };
    }
  }
  if (best) return best.slug;

  // 3. Fallback: sanitise the raw path (same algorithm as the Claude CLI).
  return path.replace(/[^a-zA-Z0-9-]/g, "-");
}

// Exported for tmux.ts — resolves a cwd to its project slug
export async function resolveSlugForCwd(cwd: string): Promise<string> {
  return getSlugForPath(cwd);
}

/**
 * Search all ~/.claude/projects/ directories for a session's .jsonl file.
 * Returns the full project filesystem path (not the dir slug) when found,
 * or null if the session cannot be located on disk.
 *
 * Used to backfill `project_path` for sessions recorded before Fix 1
 * (where input.cwd was undefined and the field was left null in SQLite).
 */
export async function findProjectPathForSession(
  sessionId: string
): Promise<string | null> {
  const dirs = await readdir(CLAUDE_PROJECTS_DIR).catch(() => [] as string[]);
  for (const dir of dirs) {
    try {
      await stat(join(CLAUDE_PROJECTS_DIR, dir, `${sessionId}.jsonl`));
      // Found — resolve dir name → full filesystem path via the slug maps.
      return resolveSlugToPath(dir);
    } catch {
      // Not in this directory — continue searching.
    }
  }
  return null;
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

// --- Git status + diff ---

export type GitStatusChange = { path: string; status: string };
export type GitStatus = {
  isRepo: boolean;
  branch: string;
  changes: GitStatusChange[];
  hasStagedChanges: boolean;
};

export async function getGitStatus(projectPath: string): Promise<GitStatus> {
  try {
    const [statusOut, branchOut] = await Promise.all([
      Bun.$`git -C ${projectPath} status --porcelain`.text(),
      Bun.$`git -C ${projectPath} branch --show-current`.text(),
    ]);
    const lines = statusOut.trim().split("\n").filter(Boolean);
    const changes = lines.map((line) => ({
      status: line.slice(0, 2).trim(),
      path: line.slice(3).trim(),
    }));
    // Check if any file has a staged change (first char of porcelain is non-space, non-?)
    const hasStagedChanges = lines.some((line) => {
      const indexChar = line[0];
      return indexChar !== " " && indexChar !== "?";
    });
    return {
      isRepo: true,
      branch: branchOut.trim(),
      changes,
      hasStagedChanges,
    };
  } catch {
    return { isRepo: false, branch: "", changes: [], hasStagedChanges: false };
  }
}

export async function getGitFileDiff(
  projectPath: string,
  filePath: string
): Promise<{ diff: string; additions: number; deletions: number } | null> {
  try {
    let diff =
      await Bun.$`git -C ${projectPath} diff HEAD -- ${filePath}`.text();

    // For untracked / brand-new files, git diff HEAD returns empty because
    // the file isn't in the index yet. Build a synthetic all-additions diff
    // from the raw file content so the viewer still shows something useful.
    if (!diff.trim()) {
      try {
        const absPath = join(projectPath, filePath);
        const content = await Bun.file(absPath).text();
        const lines = content.split("\n");
        // Remove trailing empty line that split() adds
        if (lines.at(-1) === "") lines.pop();
        diff = [
          `--- /dev/null`,
          `+++ b/${filePath}`,
          `@@ -0,0 +1,${lines.length} @@`,
          ...lines.map((l) => `+${l}`),
        ].join("\n");
      } catch {
        return null;
      }
    }

    if (!diff.trim()) return null;
    const lines = diff.split("\n");
    const additions = lines.filter(
      (l) => l.startsWith("+") && !l.startsWith("+++")
    ).length;
    const deletions = lines.filter(
      (l) => l.startsWith("-") && !l.startsWith("---")
    ).length;
    return { diff, additions, deletions };
  } catch {
    return null;
  }
}

export async function gitClone(
  repoUrl: string,
  targetPath: string,
  token?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let cloneUrl = repoUrl;
    if (token && repoUrl.startsWith("https://")) {
      // Embed PAT as HTTP Basic-Auth user — standard GitHub HTTPS clone pattern
      cloneUrl = repoUrl.replace("https://", `https://${token}@`);
    }
    // git clone <url> <path> creates targetPath itself — do NOT mkdir beforehand
    await Bun.$`git clone ${cloneUrl} ${targetPath}`.quiet();
    return { success: true };
  } catch (e: any) {
    const raw: string = e?.stderr?.toString?.() ?? String(e);
    // Sanitize token from error output before surfacing to the caller
    const sanitized = token ? raw.replaceAll(token, "***") : raw;
    return { success: false, error: sanitized };
  }
}

export async function gitPull(
  projectPath: string
): Promise<{ success: boolean; output: string }> {
  try {
    const output = await Bun.$`git -C ${projectPath} pull`.text();
    return { success: true, output: output.trim() };
  } catch (e: any) {
    return { success: false, output: e?.stderr?.toString?.() ?? String(e) };
  }
}

export async function gitStageAll(
  projectPath: string
): Promise<{ success: boolean; output: string }> {
  try {
    const output = await Bun.$`git -C ${projectPath} add .`.text();
    return { success: true, output: output.trim() || "All changes staged" };
  } catch (e: any) {
    return { success: false, output: e?.stderr?.toString?.() ?? String(e) };
  }
}

export async function gitUnstageAll(
  projectPath: string
): Promise<{ success: boolean; output: string }> {
  try {
    const output = await Bun.$`git -C ${projectPath} reset HEAD .`.text();
    return { success: true, output: output.trim() || "All changes unstaged" };
  } catch (e: any) {
    return { success: false, output: e?.stderr?.toString?.() ?? String(e) };
  }
}

export async function gitCommit(
  projectPath: string,
  message: string
): Promise<{ success: boolean; output: string }> {
  try {
    const output =
      await Bun.$`git -C ${projectPath} commit -m ${message}`.text();
    return { success: true, output: output.trim() };
  } catch (e: any) {
    return { success: false, output: e?.stderr?.toString?.() ?? String(e) };
  }
}

export async function gitCommitAndPush(
  projectPath: string,
  message: string
): Promise<{ success: boolean; output: string }> {
  try {
    const commitOutput =
      await Bun.$`git -C ${projectPath} commit -m ${message}`.text();
    const pushOutput = await Bun.$`git -C ${projectPath} push`.text();
    return {
      success: true,
      output: `${commitOutput.trim()}\n${pushOutput.trim()}`,
    };
  } catch (e: any) {
    return { success: false, output: e?.stderr?.toString?.() ?? String(e) };
  }
}

export async function gitFullDiff(projectPath: string): Promise<string> {
  try {
    return await Bun.$`git -C ${projectPath} diff HEAD`.text();
  } catch {
    return "";
  }
}

// --- Git Log / History ---

export type GitLogEntry = {
  hash: string;
  shortHash: string;
  subject: string;
  body: string;
  author: string;
  date: string;
  filesChanged?: number;
  insertions?: number;
  deletions?: number;
};

export type GitCommitFile = {
  path: string;
  additions: number;
  deletions: number;
};

export async function getGitLog(
  projectPath: string,
  limit = 20
): Promise<GitLogEntry[]> {
  try {
    // Use ASCII US (0x1f) as field separator and RS (0x1e) as record separator
    const SEP_F = "\x1f";
    const SEP_R = "\x1e";
    const fmt = `--format=%H${SEP_F}%s${SEP_F}%aN${SEP_F}%aI${SEP_F}%b${SEP_R}`;

    // Run metadata + shortstat in parallel for file counts
    const [raw, shortstatRaw] = await Promise.all([
      Bun.$`git -C ${projectPath} log ${`--max-count=${limit}`} ${fmt}`
        .quiet()
        .text(),
      Bun.$`git -C ${projectPath} log ${`--max-count=${limit}`} --format=%H --shortstat`
        .quiet()
        .text(),
    ]);

    // Parse shortstat into a map: hash → { filesChanged, insertions, deletions }
    const shortstatMap = new Map<
      string,
      { filesChanged: number; insertions: number; deletions: number }
    >();
    const SHORTSTAT_RE =
      /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/;
    const shortstatLines = shortstatRaw.trim().split("\n");
    let currentHash = "";
    for (const line of shortstatLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // If the line looks like a 40-char hex hash, it's a commit hash
      if (/^[0-9a-f]{40}$/.test(trimmed)) {
        currentHash = trimmed;
      } else if (currentHash) {
        const match = trimmed.match(SHORTSTAT_RE);
        if (match) {
          shortstatMap.set(currentHash, {
            filesChanged: parseInt(match[1], 10) || 0,
            insertions: parseInt(match[2], 10) || 0,
            deletions: parseInt(match[3], 10) || 0,
          });
        }
        currentHash = "";
      }
    }

    const records = raw
      .split(SEP_R)
      .map((r) => r.trim())
      .filter(Boolean);
    const entries: GitLogEntry[] = [];

    for (const record of records) {
      const parts = record.split(SEP_F);
      if (parts.length < 4) continue;
      const [hash, subject, author, date, ...rest] = parts;
      const body = rest.join(SEP_F).trim();
      const h = hash?.trim();
      if (!h) continue;
      const stats = shortstatMap.get(h);
      entries.push({
        hash: h,
        shortHash: h.slice(0, 7),
        subject: subject?.trim() ?? "",
        body,
        author: author?.trim() ?? "",
        date: date?.trim() ?? "",
        ...(stats && {
          filesChanged: stats.filesChanged,
          insertions: stats.insertions,
          deletions: stats.deletions,
        }),
      });
    }
    return entries;
  } catch {
    return [];
  }
}

export async function getGitCommitFiles(
  projectPath: string,
  hash: string
): Promise<GitCommitFile[]> {
  try {
    // --numstat outputs: additions\tdeletions\tpath
    const out =
      await Bun.$`git -C ${projectPath} show ${"--format="} --numstat ${hash}`
        .quiet()
        .text();
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("\t");
        if (parts.length < 3) return null;
        const [addStr, delStr, path] = parts;
        return {
          path: path.trim(),
          additions: addStr === "-" ? 0 : parseInt(addStr, 10) || 0,
          deletions: delStr === "-" ? 0 : parseInt(delStr, 10) || 0,
        };
      })
      .filter((x): x is GitCommitFile => x !== null);
  } catch {
    return [];
  }
}

export async function getGitCommitDiff(
  projectPath: string,
  hash: string,
  filePath: string
): Promise<string> {
  try {
    return await Bun.$`git -C ${projectPath} show ${hash} -- ${filePath}`
      .quiet()
      .text();
  } catch {
    return "";
  }
}

export type GitWorktree = {
  path: string;
  head: string;
  branch: string;
  isMain: boolean;
  isCurrent: boolean;
};

export async function getGitWorktrees(
  projectPath: string
): Promise<GitWorktree[]> {
  try {
    const output = await Bun.$`git -C ${projectPath} worktree list --porcelain`
      .quiet()
      .text();
    const blocks = output.trim().split(/\n\n+/);
    const worktrees: GitWorktree[] = [];

    for (const block of blocks) {
      if (!block.trim()) continue;
      const lines = block.trim().split("\n");
      let path = "";
      let head = "";
      let branch = "";

      for (const line of lines) {
        if (line.startsWith("worktree ")) path = line.slice(9).trim();
        else if (line.startsWith("HEAD ")) head = line.slice(5).trim();
        else if (line.startsWith("branch ")) {
          const ref = line.slice(7).trim();
          branch = ref.replace(/^refs\/heads\//, "");
        } else if (line === "detached") {
          branch = "(detached)";
        }
      }

      if (path) {
        worktrees.push({
          path,
          head: head.slice(0, 8),
          branch: branch || "(unknown)",
          isMain: worktrees.length === 0,
          isCurrent: path === projectPath,
        });
      }
    }

    // Only return when there are 2+ worktrees (single worktree is uninteresting)
    if (worktrees.length < 2) return [];
    return worktrees;
  } catch {
    return [];
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

  // Exclude the home directory — it is the "root workspace", not a real
  // project, and showing it as a project card causes confusion.
  return projects.filter((p) => p.path !== USER_HOME);
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

export async function readProjectEnv(
  projectPath: string
): Promise<Record<string, string>> {
  const config = await readClaudeConfig();
  return config.projects[projectPath]?.env ?? {};
}

export async function writeProjectEnv(
  projectPath: string,
  env: Record<string, string>
): Promise<void> {
  // Read the raw file so we don't clobber unrecognised fields
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(await readFile(CLAUDE_CONFIG_PATH, "utf-8")) as Record<
      string,
      unknown
    >;
  } catch {
    // file may not exist yet — start fresh
  }

  const projects = (raw.projects ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  projects[projectPath] = { ...projects[projectPath], env };
  raw.projects = projects;

  await mkdir(CLAUDE_DIR, { recursive: true });
  await writeFile(CLAUDE_CONFIG_PATH, JSON.stringify(raw, null, 2), "utf-8");

  // Bust the in-memory cache so subsequent reads reflect the change
  configCache = null;
}

export async function removeProjectFromConfig(
  projectPath: string
): Promise<void> {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(await readFile(CLAUDE_CONFIG_PATH, "utf-8")) as Record<
      string,
      unknown
    >;
  } catch {
    return; // file doesn't exist, nothing to remove
  }

  const projects = (raw.projects ?? {}) as Record<string, unknown>;
  delete projects[projectPath];
  raw.projects = projects;

  await writeFile(CLAUDE_CONFIG_PATH, JSON.stringify(raw, null, 2), "utf-8");
  configCache = null;
}

export async function removeProjectSessionDir(slug: string): Promise<void> {
  const dirPath = join(CLAUDE_PROJECTS_DIR, slug);
  try {
    await rm(dirPath, { recursive: true, force: true });
  } catch {
    // Directory may not exist — that's fine
  }
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

// --- Session preview: last assistant text ---

export async function getSessionLastAssistantText(
  slug: string,
  sessionId: string
): Promise<string | null> {
  const filePath = join(CLAUDE_PROJECTS_DIR, slug, `${sessionId}.jsonl`);

  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return null;
  }

  const lines = content.trim().split("\n");

  // Walk lines in reverse — find the last assistant message with text content
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as RawJSONLLine;
      if (!isAssistantLine(parsed)) continue;
      const blocks = parsed.message.content;
      if (!Array.isArray(blocks)) continue;
      const textParts: string[] = [];
      for (const block of blocks) {
        if (
          block.type === "text" &&
          typeof block.text === "string" &&
          block.text.trim()
        ) {
          textParts.push(block.text.trim());
        }
      }
      if (textParts.length > 0) {
        const full = textParts.join("\n\n");
        return full.length > 600 ? full.slice(0, 600) + "…" : full;
      }
    } catch {}
  }

  return null;
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
    // Strip CLAUDECODE so the CLI doesn't refuse to run inside an active session
    const { CLAUDECODE: _cc, ...env } = process.env;
    const proc = Bun.spawn(["claude", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env,
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

// --- Shell Command Execution ---

/**
 * Run an arbitrary shell command (used for bootstrap scaffolding like
 * `bun create better-t-stack@latest`). Uses Bun.spawn array form to avoid
 * shell injection. Returns a result object matching runClaudeCli's shape.
 */
export async function runShellCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = 180_000
): Promise<{ success: boolean; output?: string; error?: string }> {
  console.log(
    `[runShellCommand] running: ${command} ${args.join(" ")} (cwd=${cwd})`
  );
  try {
    // Ensure PATH includes standard binary locations — the Next.js runtime
    // may inherit a stripped PATH that's missing /usr/local/bin (where bun
    // lives in oven/bun images) or the user-local bin dirs.
    const basePath = process.env.PATH ?? "";
    const extraDirs = [
      "/usr/local/bin",
      "/home/bun/.bun/bin",
      "/home/bun/.local/bin",
    ];
    const enrichedPath = [
      ...extraDirs.filter((d) => !basePath.includes(d)),
      basePath,
    ]
      .filter(Boolean)
      .join(":");

    const proc = Bun.spawn([command, ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PATH: enrichedPath },
    });

    const timer = setTimeout(() => proc.kill(), timeoutMs);
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    clearTimeout(timer);

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      console.error(
        `[runShellCommand] Command failed: ${command} ${args.join(" ")}`
      );
      console.error(`[runShellCommand] Exit code: ${exitCode}`);
      if (stderr)
        console.error(`[runShellCommand] stderr: ${stderr.slice(0, 2000)}`);
      if (stdout)
        console.error(`[runShellCommand] stdout: ${stdout.slice(0, 2000)}`);
      return {
        success: false,
        error: stderr || stdout || `Exit code ${exitCode}`,
      };
    }
    console.log(`[runShellCommand] success: ${command} ${args.join(" ")}`);
    return { success: true, output: stdout };
  } catch (e) {
    console.error(
      `[runShellCommand] Exception running: ${command} ${args.join(" ")}`,
      e
    );
    return {
      success: false,
      error: e instanceof Error ? e.message : "Command execution failed",
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
  headers?: Record<string, string>;
}

export async function inspectMcpTools(
  serverConfig: McpServerConfig
): Promise<McpTool[]> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const transport = serverConfig.type ?? "stdio";

  const mcpClient = new Client({
    name: process.env.INSTANCE_NAME ?? "claude-explorer",
    version: "1.0.0",
  });

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
    mcpTransport = new StreamableHTTPClientTransport(
      new URL(serverConfig.url),
      serverConfig.headers
        ? { requestInit: { headers: serverConfig.headers } }
        : {}
    );
  } else if (transport === "sse") {
    const { SSEClientTransport } =
      await import("@modelcontextprotocol/sdk/client/sse.js");
    if (!serverConfig.url) throw new Error("No URL specified for sse server");
    mcpTransport = new SSEClientTransport(
      new URL(serverConfig.url),
      serverConfig.headers
        ? { requestInit: { headers: serverConfig.headers } }
        : {}
    );
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
