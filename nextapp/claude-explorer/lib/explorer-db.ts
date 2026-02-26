import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { getSessionEventBus } from "./event-bus";
import { sendPushNotification } from "./push-notifications";

// --- Types ---

export type SessionState =
  | "initializing"
  | "thinking"
  | "tool_running"
  | "subagent_running"
  | "compacting"
  | "waiting_for_permission"
  | "stopped"
  | "done"
  | "error";

export interface SessionRow {
  session_id: string;
  project_path: string | null;
  state: SessionState;
  current_tool: string | null;
  source: string | null;
  model: string | null;
  first_prompt: string | null;
  git_branch: string | null;
  started_at: string;
  updated_at: string;
  ended_at: string | null;
  cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  num_turns: number | null;
  duration_ms: number | null;
  error: string | null;
  is_archived: number; // 0 = visible, 1 = archived
}

export type SessionPatch = Partial<Omit<SessionRow, "session_id">>;

// --- Singleton DB ---

let db: Database | null = null;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function _resetDB(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function getDB(): Database {
  if (db) return db;

  const dbPath =
    process.env.EXPLORER_DB_PATH ?? join(homedir(), ".claude", "explorer.db");
  const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA busy_timeout=3000");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id     TEXT PRIMARY KEY,
      project_path   TEXT,
      state          TEXT NOT NULL DEFAULT 'initializing',
      current_tool   TEXT,
      source         TEXT,
      model          TEXT,
      first_prompt   TEXT,
      git_branch     TEXT,
      started_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL,
      ended_at       TEXT,
      cost_usd       REAL,
      input_tokens   INTEGER,
      output_tokens  INTEGER,
      num_turns      INTEGER,
      duration_ms    INTEGER,
      error          TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);
  `);

  // Migration: add git_branch column to existing DBs
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN git_branch TEXT");
  } catch {
    // Column already exists
  }

  // Migration: add is_archived column to existing DBs
  try {
    db.exec(
      "ALTER TABLE sessions ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0"
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(is_archived)"
    );
  } catch {
    // Column already exists
  }

  // Migration: fix project paths that were corrupted by the lossy slug→path
  // conversion in buildSlugMaps (replacing ALL hyphens with slashes in orphan
  // directory names, which mangled hyphenated project names like
  // "claude-agent-sdkexploration" → "claude/agent/sdkexploration").
  // We detect any stored path whose on-disk directory does NOT exist but whose
  // sanitised form matches a sibling path that DOES exist, then correct it.
  try {
    const { homedir } = require("node:os");
    const { join: pathJoin, dirname: pathDirname } = require("node:path");
    const home = process.env.CLAUDE_CONFIG_DIR
      ? pathDirname(process.env.CLAUDE_CONFIG_DIR)
      : homedir();
    const fs = require("node:fs");
    const claudeConfigPath = pathJoin(
      process.env.CLAUDE_CONFIG_DIR ?? pathJoin(home, ".claude"),
      ".claude.json"
    );
    let configProjects: string[] = [];
    try {
      const raw = JSON.parse(fs.readFileSync(claudeConfigPath, "utf-8"));
      configProjects = Object.keys(raw.projects ?? {});
    } catch {
      // Config unreadable — skip migration
    }

    if (configProjects.length > 0) {
      // For each distinct project_path in the DB, check if it looks like a
      // corrupted path (doesn't exist on disk) and if a registered config
      // path sanitises to the same slug.
      const rows = db
        .query<{ project_path: string }, []>(
          "SELECT DISTINCT project_path FROM sessions WHERE project_path IS NOT NULL"
        )
        .all();

      for (const { project_path } of rows) {
        // Skip paths that exist on disk — they are not corrupted.
        if (fs.existsSync(project_path)) continue;

        // Check if a registered config path has the same canonical slug
        // (i.e. sanitises to the same string as this path sanitises to).
        const corruptedSlug = project_path.replace(/[^a-zA-Z0-9-]/g, "-");
        const correctPath = configProjects.find(
          (p) => p.replace(/[^a-zA-Z0-9-]/g, "-") === corruptedSlug
        );
        if (correctPath && correctPath !== project_path) {
          db.exec(
            `UPDATE sessions SET project_path = '${correctPath.replace(/'/g, "''")}' WHERE project_path = '${project_path.replace(/'/g, "''")}'`
          );
          console.log(
            `[explorer-db] Corrected corrupted project_path: "${project_path}" → "${correctPath}"`
          );
        }
      }
    }
  } catch (err) {
    // Non-fatal — corrupted paths will remain but the app still functions.
    console.warn("[explorer-db] Skipped corrupted-path migration:", err);
  }

  return db;
}

// --- CRUD ---

export function upsertSession(sessionId: string, patch: SessionPatch): void {
  const d = getDB();
  const now = new Date().toISOString();

  // Check if row exists
  const existing = d
    .query<SessionRow, [string]>("SELECT * FROM sessions WHERE session_id = ?")
    .get(sessionId);

  if (!existing) {
    // INSERT
    const row: SessionRow = {
      session_id: sessionId,
      project_path: patch.project_path ?? null,
      state: patch.state ?? "initializing",
      current_tool: patch.current_tool ?? null,
      source: patch.source ?? null,
      model: patch.model ?? null,
      first_prompt: patch.first_prompt ?? null,
      git_branch: patch.git_branch ?? null,
      started_at: patch.started_at ?? now,
      updated_at: now,
      ended_at: patch.ended_at ?? null,
      cost_usd: patch.cost_usd ?? null,
      input_tokens: patch.input_tokens ?? null,
      output_tokens: patch.output_tokens ?? null,
      num_turns: patch.num_turns ?? null,
      duration_ms: patch.duration_ms ?? null,
      error: patch.error ?? null,
      is_archived: patch.is_archived ?? 0,
    };

    d.query(
      `INSERT INTO sessions (session_id, project_path, state, current_tool, source, model, first_prompt, git_branch, started_at, updated_at, ended_at, cost_usd, input_tokens, output_tokens, num_turns, duration_ms, error, is_archived)
       VALUES ($session_id, $project_path, $state, $current_tool, $source, $model, $first_prompt, $git_branch, $started_at, $updated_at, $ended_at, $cost_usd, $input_tokens, $output_tokens, $num_turns, $duration_ms, $error, $is_archived)`
    ).run({
      $session_id: row.session_id,
      $project_path: row.project_path,
      $state: row.state,
      $current_tool: row.current_tool,
      $source: row.source,
      $model: row.model,
      $first_prompt: row.first_prompt,
      $git_branch: row.git_branch,
      $started_at: row.started_at,
      $updated_at: row.updated_at,
      $ended_at: row.ended_at,
      $cost_usd: row.cost_usd,
      $input_tokens: row.input_tokens,
      $output_tokens: row.output_tokens,
      $num_turns: row.num_turns,
      $duration_ms: row.duration_ms,
      $error: row.error,
      $is_archived: row.is_archived,
    });
  } else {
    // UPDATE only provided fields
    const sets: string[] = ["updated_at = ?"];
    const vals: (string | number | null)[] = [now];

    for (const [key, val] of Object.entries(patch)) {
      if (val !== undefined) {
        sets.push(`${key} = ?`);
        vals.push(val as string | number | null);
      }
    }

    vals.push(sessionId);
    d.query(`UPDATE sessions SET ${sets.join(", ")} WHERE session_id = ?`).run(
      ...vals
    );
  }

  // Emit event
  const updated = getSession(sessionId);
  if (updated) {
    console.log(
      `[explorer-db] emit session:state ${sessionId} state=${updated.state}${updated.current_tool ? ` tool=${updated.current_tool}` : ""}`
    );
    getSessionEventBus().emit("session:state", {
      sessionId,
      state: updated.state,
      currentTool: updated.current_tool,
      projectPath: updated.project_path,
    });

    // Fire push notifications for terminal/notable states
    const promptPreview = updated.first_prompt?.slice(0, 80) ?? "Session";
    if (updated.state === "done") {
      sendPushNotification({
        title: "Agent session complete",
        body: promptPreview,
        url: `/sessions/${sessionId}`,
        tag: `session-done-${sessionId}`,
        event: "sessionCompleted",
      }).catch(() => {});
    } else if (updated.state === "error") {
      sendPushNotification({
        title: "Agent session failed",
        body: promptPreview,
        url: `/sessions/${sessionId}`,
        tag: `session-error-${sessionId}`,
        event: "sessionFailed",
      }).catch(() => {});
    } else if (updated.state === "waiting_for_permission") {
      sendPushNotification({
        title: "Agent needs permission",
        body: promptPreview,
        url: `/sessions/${sessionId}`,
        tag: `session-permission-${sessionId}`,
        event: "sessionNeedsPermission",
      }).catch(() => {});
    }
  }
}

export function getSession(sessionId: string): SessionRow | null {
  return (
    getDB()
      .query<SessionRow, [string]>(
        "SELECT * FROM sessions WHERE session_id = ?"
      )
      .get(sessionId) ?? null
  );
}

export function getActiveSessions(): SessionRow[] {
  // Opportunistic cleanup
  cleanOldSessions(SEVEN_DAYS_MS);

  return getDB()
    .query<SessionRow, []>(
      "SELECT * FROM sessions WHERE state NOT IN ('done', 'stopped', 'error') AND is_archived = 0 ORDER BY updated_at DESC"
    )
    .all();
}

export function getProjectSessions(
  projectPath: string,
  limit = 20
): SessionRow[] {
  // Match both exact path AND any subdirectory (project_path LIKE '/path/%')
  // so sessions started inside a subdirectory of the project are included.
  return getDB()
    .query<SessionRow, [string, string, number]>(
      "SELECT * FROM sessions WHERE (project_path = ? OR project_path LIKE ?) AND is_archived = 0 ORDER BY updated_at DESC LIMIT ?"
    )
    .all(projectPath, projectPath + "/%", limit);
}

export function getAllRecentSessions(limit = 50): SessionRow[] {
  return getDB()
    .query<SessionRow, [number]>(
      "SELECT * FROM sessions WHERE is_archived = 0 ORDER BY updated_at DESC LIMIT ?"
    )
    .all(limit);
}

export function cleanOldSessions(maxAgeMs: number): void {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  getDB()
    .query(
      "DELETE FROM sessions WHERE state IN ('done', 'stopped', 'error') AND is_archived = 0 AND updated_at < ?"
    )
    .run(cutoff);
}
