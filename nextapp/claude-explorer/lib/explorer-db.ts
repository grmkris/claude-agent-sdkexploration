import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

import { getSessionEventBus } from "./event-bus";

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

  const dbPath = process.env.EXPLORER_DB_PATH ?? join(homedir(), ".claude", "explorer.db");
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
    };

    d.query(
      `INSERT INTO sessions (session_id, project_path, state, current_tool, source, model, first_prompt, git_branch, started_at, updated_at, ended_at, cost_usd, input_tokens, output_tokens, num_turns, duration_ms, error)
       VALUES ($session_id, $project_path, $state, $current_tool, $source, $model, $first_prompt, $git_branch, $started_at, $updated_at, $ended_at, $cost_usd, $input_tokens, $output_tokens, $num_turns, $duration_ms, $error)`
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
    console.log(`[explorer-db] emit session:state ${sessionId} state=${updated.state}${updated.current_tool ? ` tool=${updated.current_tool}` : ""}`);
    getSessionEventBus().emit("session:state", {
      sessionId,
      state: updated.state,
      currentTool: updated.current_tool,
      projectPath: updated.project_path,
    });
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
      "SELECT * FROM sessions WHERE state NOT IN ('done', 'stopped', 'error') ORDER BY updated_at DESC"
    )
    .all();
}

export function getProjectSessions(
  projectPath: string,
  limit = 20
): SessionRow[] {
  return getDB()
    .query<SessionRow, [string, number]>(
      "SELECT * FROM sessions WHERE project_path = ? ORDER BY updated_at DESC LIMIT ?"
    )
    .all(projectPath, limit);
}

export function getAllRecentSessions(limit = 50): SessionRow[] {
  return getDB()
    .query<SessionRow, [number]>(
      "SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?"
    )
    .all(limit);
}

export function cleanOldSessions(maxAgeMs: number): void {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  getDB()
    .query(
      "DELETE FROM sessions WHERE state IN ('done', 'stopped', 'error') AND updated_at < ?"
    )
    .run(cutoff);
}
