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
  context_window: number | null;
  max_context_window: number | null;
  parent_session_id: string | null;
  forked_at_message_uuid: string | null;
  fork_label: string | null;
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
      cost_usd           REAL,
      input_tokens       INTEGER,
      output_tokens      INTEGER,
      num_turns          INTEGER,
      duration_ms        INTEGER,
      error              TEXT,
      context_window     INTEGER,
      max_context_window INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);

    CREATE TABLE IF NOT EXISTS pending_questions (
      tool_use_id        TEXT PRIMARY KEY,
      session_id         TEXT NOT NULL,
      tool_input         TEXT NOT NULL,
      prefilled_answers  TEXT,
      created_at         TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pq_session ON pending_questions(session_id);

    CREATE TABLE IF NOT EXISTS pending_exit_plan_mode (
      tool_use_id      TEXT PRIMARY KEY,
      session_id       TEXT NOT NULL,
      tool_input       TEXT NOT NULL,
      plan_text        TEXT NOT NULL,
      allowed_prompts  TEXT NOT NULL,
      prefilled_approved INTEGER,
      prefilled_feedback TEXT,
      created_at       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pepm_session ON pending_exit_plan_mode(session_id);
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

  // Migration: add context_window columns to existing DBs
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN context_window INTEGER");
  } catch {
    // Column already exists
  }
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN max_context_window INTEGER");
  } catch {
    // Column already exists
  }

  // Migration: add plan_file_path column to pending_exit_plan_mode
  try {
    db.exec(
      "ALTER TABLE pending_exit_plan_mode ADD COLUMN plan_file_path TEXT NOT NULL DEFAULT ''"
    );
  } catch {
    // Column already exists
  }

  // Migration: create mcp_preferences table (default vs optional)
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_preferences (
      server_name  TEXT NOT NULL,
      scope        TEXT NOT NULL,
      project_path TEXT NOT NULL DEFAULT '',
      mode         TEXT NOT NULL DEFAULT 'default',
      PRIMARY KEY (server_name, scope, project_path)
    );
  `);

  // Migration: create session_mcp_selections table (which optional MCPs were enabled per session)
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_mcp_selections (
      session_id   TEXT NOT NULL,
      server_name  TEXT NOT NULL,
      scope        TEXT NOT NULL,
      PRIMARY KEY (session_id, server_name, scope)
    );
    CREATE INDEX IF NOT EXISTS idx_sms_session ON session_mcp_selections(session_id);
  `);

  // Migration: workspace groups tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_groups (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      project_path TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspace_group_sessions (
      group_id    TEXT NOT NULL REFERENCES workspace_groups(id),
      session_id  TEXT NOT NULL,
      position    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (group_id, session_id)
    );
    CREATE INDEX IF NOT EXISTS idx_wgs_group ON workspace_group_sessions(group_id);
  `);

  // Migration: add fork tracking columns to existing DBs
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN parent_session_id TEXT");
  } catch {
    // Column already exists
  }
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN forked_at_message_uuid TEXT");
  } catch {
    // Column already exists
  }
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN fork_label TEXT");
  } catch {
    // Column already exists
  }
  try {
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id)"
    );
  } catch {
    // Index already exists
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
      context_window: patch.context_window ?? null,
      max_context_window: patch.max_context_window ?? null,
      parent_session_id: patch.parent_session_id ?? null,
      forked_at_message_uuid: patch.forked_at_message_uuid ?? null,
      fork_label: patch.fork_label ?? null,
    };

    d.query(
      `INSERT INTO sessions (session_id, project_path, state, current_tool, source, model, first_prompt, git_branch, started_at, updated_at, ended_at, cost_usd, input_tokens, output_tokens, num_turns, duration_ms, error, is_archived, context_window, max_context_window, parent_session_id, forked_at_message_uuid, fork_label)
       VALUES ($session_id, $project_path, $state, $current_tool, $source, $model, $first_prompt, $git_branch, $started_at, $updated_at, $ended_at, $cost_usd, $input_tokens, $output_tokens, $num_turns, $duration_ms, $error, $is_archived, $context_window, $max_context_window, $parent_session_id, $forked_at_message_uuid, $fork_label)`
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
      $context_window: row.context_window,
      $max_context_window: row.max_context_window,
      $parent_session_id: row.parent_session_id,
      $forked_at_message_uuid: row.forked_at_message_uuid,
      $fork_label: row.fork_label,
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

export function getSessionForks(parentSessionId: string): SessionRow[] {
  return getDB()
    .query<SessionRow, [string]>(
      "SELECT * FROM sessions WHERE parent_session_id = ? ORDER BY started_at ASC"
    )
    .all(parentSessionId);
}

export function getSessionAncestry(sessionId: string): SessionRow[] {
  const chain: SessionRow[] = [];
  let current = getSession(sessionId);
  while (current?.parent_session_id) {
    const parent = getSession(current.parent_session_id);
    if (!parent) break;
    chain.push(parent);
    current = parent;
  }
  return chain;
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
  limit = 20,
  includeArchived = false
): SessionRow[] {
  // Match both exact path AND any subdirectory (project_path LIKE '/path/%')
  // so sessions started inside a subdirectory of the project are included.
  const archivedFilter = includeArchived ? 1 : 0;
  return getDB()
    .query<SessionRow, [string, string, number]>(
      `SELECT * FROM sessions WHERE (project_path = ? OR project_path LIKE ?) AND is_archived = ${archivedFilter} ORDER BY updated_at DESC LIMIT ?`
    )
    .all(projectPath, projectPath + "/%", limit);
}

export function getAllRecentSessions(
  limit = 50,
  includeArchived = false
): SessionRow[] {
  const archivedFilter = includeArchived ? 1 : 0;
  return getDB()
    .query<SessionRow, [number]>(
      `SELECT * FROM sessions WHERE is_archived = ${archivedFilter} ORDER BY updated_at DESC LIMIT ?`
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

// --- Pending Questions (AskUserQuestion resilience across restarts) ---

export interface PendingQuestionRow {
  tool_use_id: string;
  session_id: string;
  tool_input: string; // JSON
  prefilled_answers: string | null; // JSON
  created_at: string;
}

export function upsertPendingQuestion(
  toolUseId: string,
  sessionId: string,
  toolInput: Record<string, unknown>
): void {
  getDB()
    .query(
      `INSERT INTO pending_questions (tool_use_id, session_id, tool_input, prefilled_answers, created_at)
       VALUES (?, ?, ?, NULL, ?)
       ON CONFLICT(tool_use_id) DO NOTHING`
    )
    .run(
      toolUseId,
      sessionId,
      JSON.stringify(toolInput),
      new Date().toISOString()
    );
}

export function setPrefilledAnswers(
  toolUseId: string,
  answers: Record<string, string>
): void {
  getDB()
    .query(
      "UPDATE pending_questions SET prefilled_answers = ? WHERE tool_use_id = ?"
    )
    .run(JSON.stringify(answers), toolUseId);
}

export function getPendingQuestion(toolUseId: string): {
  toolUseId: string;
  sessionId: string;
  toolInput: Record<string, unknown>;
  prefilledAnswers: Record<string, string> | null;
} | null {
  const row = getDB()
    .query<PendingQuestionRow, [string]>(
      "SELECT * FROM pending_questions WHERE tool_use_id = ?"
    )
    .get(toolUseId);
  if (!row) return null;
  return {
    toolUseId: row.tool_use_id,
    sessionId: row.session_id,
    toolInput: JSON.parse(row.tool_input) as Record<string, unknown>,
    prefilledAnswers: row.prefilled_answers
      ? (JSON.parse(row.prefilled_answers) as Record<string, string>)
      : null,
  };
}

export function deletePendingQuestion(toolUseId: string): void {
  getDB()
    .query("DELETE FROM pending_questions WHERE tool_use_id = ?")
    .run(toolUseId);
}

export function deletePendingQuestionsForSession(sessionId: string): void {
  getDB()
    .query("DELETE FROM pending_questions WHERE session_id = ?")
    .run(sessionId);
}

// --- Pending ExitPlanMode (plan approval resilience across restarts) ---

export interface PendingExitPlanModeRow {
  tool_use_id: string;
  session_id: string;
  tool_input: string; // JSON
  plan_text: string;
  plan_file_path: string;
  allowed_prompts: string; // JSON array
  prefilled_approved: number | null; // 1 = approved, 0 = rejected, null = not yet set
  prefilled_feedback: string | null;
  created_at: string;
}

export function upsertPendingExitPlanMode(
  toolUseId: string,
  sessionId: string,
  toolInput: Record<string, unknown>,
  planText: string,
  planFilePath: string,
  allowedPrompts: Array<{ tool: string; prompt: string }>
): void {
  getDB()
    .query(
      `INSERT INTO pending_exit_plan_mode
         (tool_use_id, session_id, tool_input, plan_text, plan_file_path, allowed_prompts, prefilled_approved, prefilled_feedback, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)
       ON CONFLICT(tool_use_id) DO NOTHING`
    )
    .run(
      toolUseId,
      sessionId,
      JSON.stringify(toolInput),
      planText,
      planFilePath,
      JSON.stringify(allowedPrompts),
      new Date().toISOString()
    );
}

export function setPrefilledApproval(
  toolUseId: string,
  approved: boolean,
  feedback?: string
): void {
  getDB()
    .query(
      "UPDATE pending_exit_plan_mode SET prefilled_approved = ?, prefilled_feedback = ? WHERE tool_use_id = ?"
    )
    .run(approved ? 1 : 0, feedback ?? null, toolUseId);
}

export function getPendingExitPlanMode(toolUseId: string): {
  toolUseId: string;
  sessionId: string;
  toolInput: Record<string, unknown>;
  planText: string;
  planFilePath: string;
  allowedPrompts: Array<{ tool: string; prompt: string }>;
  prefilledApproved: boolean | null;
  prefilledFeedback: string | null;
} | null {
  const row = getDB()
    .query<PendingExitPlanModeRow, [string]>(
      "SELECT * FROM pending_exit_plan_mode WHERE tool_use_id = ?"
    )
    .get(toolUseId);
  if (!row) return null;
  return {
    toolUseId: row.tool_use_id,
    sessionId: row.session_id,
    toolInput: JSON.parse(row.tool_input) as Record<string, unknown>,
    planText: row.plan_text,
    planFilePath: row.plan_file_path ?? "",
    allowedPrompts: JSON.parse(row.allowed_prompts) as Array<{
      tool: string;
      prompt: string;
    }>,
    prefilledApproved:
      row.prefilled_approved === null ? null : row.prefilled_approved === 1,
    prefilledFeedback: row.prefilled_feedback,
  };
}

export function deletePendingExitPlanMode(toolUseId: string): void {
  getDB()
    .query("DELETE FROM pending_exit_plan_mode WHERE tool_use_id = ?")
    .run(toolUseId);
}

export function deletePendingExitPlanModeForSession(sessionId: string): void {
  getDB()
    .query("DELETE FROM pending_exit_plan_mode WHERE session_id = ?")
    .run(sessionId);
}

// --- MCP Preferences (default vs optional) ---

export type McpMode = "default" | "optional";

export interface McpPreferenceRow {
  server_name: string;
  scope: string;
  project_path: string;
  mode: McpMode;
}

/**
 * Get MCP preferences. When projectPath is provided, returns preferences for
 * that project (scope=project|local) PLUS user-scope preferences.
 * When not provided, returns only user-scope preferences.
 */
export function getMcpPreferences(projectPath?: string): McpPreferenceRow[] {
  const d = getDB();
  if (projectPath) {
    return d
      .query<McpPreferenceRow, [string]>(
        "SELECT * FROM mcp_preferences WHERE project_path = '' OR project_path = ?"
      )
      .all(projectPath);
  }
  return d
    .query<McpPreferenceRow, []>(
      "SELECT * FROM mcp_preferences WHERE project_path = ''"
    )
    .all();
}

/**
 * Get the mode for a specific MCP server. Returns 'default' if no preference exists.
 */
export function getMcpMode(
  serverName: string,
  scope: string,
  projectPath: string = ""
): McpMode {
  const d = getDB();
  const row = d
    .query<McpPreferenceRow, [string, string, string]>(
      "SELECT * FROM mcp_preferences WHERE server_name = ? AND scope = ? AND project_path = ?"
    )
    .get(serverName, scope, projectPath);
  return (row?.mode as McpMode) ?? "default";
}

/**
 * Set the mode (default/optional) for an MCP server.
 */
export function setMcpPreference(
  serverName: string,
  scope: string,
  projectPath: string = "",
  mode: McpMode
): void {
  getDB()
    .query(
      `INSERT INTO mcp_preferences (server_name, scope, project_path, mode)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(server_name, scope, project_path) DO UPDATE SET mode = excluded.mode`
    )
    .run(serverName, scope, projectPath, mode);
}

/**
 * Delete an MCP preference (resets to default).
 */
export function deleteMcpPreference(
  serverName: string,
  scope: string,
  projectPath: string = ""
): void {
  getDB()
    .query(
      "DELETE FROM mcp_preferences WHERE server_name = ? AND scope = ? AND project_path = ?"
    )
    .run(serverName, scope, projectPath);
}

// --- Session MCP Selections (which optional MCPs were enabled for a session) ---

export interface SessionMcpSelectionRow {
  session_id: string;
  server_name: string;
  scope: string;
}

/**
 * Save the optional MCPs that were enabled for a session (for resume).
 */
export function saveSessionMcpSelections(
  sessionId: string,
  selections: Array<{ name: string; scope: string }>
): void {
  const d = getDB();
  const stmt = d.query(
    `INSERT INTO session_mcp_selections (session_id, server_name, scope)
     VALUES (?, ?, ?)
     ON CONFLICT(session_id, server_name, scope) DO NOTHING`
  );
  for (const sel of selections) {
    stmt.run(sessionId, sel.name, sel.scope);
  }
}

/**
 * Get the optional MCP selections for a session (for resume).
 */
export function getSessionMcpSelections(
  sessionId: string
): SessionMcpSelectionRow[] {
  return getDB()
    .query<SessionMcpSelectionRow, [string]>(
      "SELECT * FROM session_mcp_selections WHERE session_id = ?"
    )
    .all(sessionId);
}

// --- Search ---

// --- Workspace Groups ---

export interface WorkspaceGroupRow {
  id: string;
  name: string;
  project_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceGroupSessionRow {
  group_id: string;
  session_id: string;
  position: number;
}

export function createWorkspaceGroup(
  id: string,
  name: string,
  projectPath?: string
): void {
  const now = new Date().toISOString();
  getDB()
    .query(
      `INSERT INTO workspace_groups (id, name, project_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, name, projectPath ?? null, now, now);
}

export function listWorkspaceGroups(
  projectPath?: string
): (WorkspaceGroupRow & { session_count: number })[] {
  const d = getDB();
  if (projectPath) {
    return d
      .query<WorkspaceGroupRow & { session_count: number }, [string]>(
        `SELECT g.*, COUNT(gs.session_id) as session_count
         FROM workspace_groups g
         LEFT JOIN workspace_group_sessions gs ON gs.group_id = g.id
         WHERE g.project_path = ?
         GROUP BY g.id
         ORDER BY g.updated_at DESC`
      )
      .all(projectPath);
  }
  return d
    .query<WorkspaceGroupRow & { session_count: number }, []>(
      `SELECT g.*, COUNT(gs.session_id) as session_count
       FROM workspace_groups g
       LEFT JOIN workspace_group_sessions gs ON gs.group_id = g.id
       GROUP BY g.id
       ORDER BY g.updated_at DESC`
    )
    .all();
}

export function getWorkspaceGroup(
  id: string
): (WorkspaceGroupRow & { sessions: WorkspaceGroupSessionRow[] }) | null {
  const d = getDB();
  const group = d
    .query<WorkspaceGroupRow, [string]>(
      "SELECT * FROM workspace_groups WHERE id = ?"
    )
    .get(id);
  if (!group) return null;
  const sessions = d
    .query<WorkspaceGroupSessionRow, [string]>(
      "SELECT * FROM workspace_group_sessions WHERE group_id = ? ORDER BY position ASC"
    )
    .all(id);
  return { ...group, sessions };
}

export function renameWorkspaceGroup(id: string, name: string): void {
  getDB()
    .query(
      "UPDATE workspace_groups SET name = ?, updated_at = ? WHERE id = ?"
    )
    .run(name, new Date().toISOString(), id);
}

export function deleteWorkspaceGroup(id: string): void {
  const d = getDB();
  d.query("DELETE FROM workspace_group_sessions WHERE group_id = ?").run(id);
  d.query("DELETE FROM workspace_groups WHERE id = ?").run(id);
}

export function addSessionToGroup(
  groupId: string,
  sessionId: string,
  position?: number
): void {
  const d = getDB();
  const pos =
    position ??
    (d
      .query<{ max_pos: number | null }, [string]>(
        "SELECT MAX(position) as max_pos FROM workspace_group_sessions WHERE group_id = ?"
      )
      .get(groupId)?.max_pos ?? -1) + 1;

  d.query(
    `INSERT INTO workspace_group_sessions (group_id, session_id, position)
     VALUES (?, ?, ?)
     ON CONFLICT(group_id, session_id) DO UPDATE SET position = excluded.position`
  ).run(groupId, sessionId, pos);

  d.query("UPDATE workspace_groups SET updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    groupId
  );
}

export function removeSessionFromGroup(
  groupId: string,
  sessionId: string
): void {
  const d = getDB();
  d.query(
    "DELETE FROM workspace_group_sessions WHERE group_id = ? AND session_id = ?"
  ).run(groupId, sessionId);
  d.query("UPDATE workspace_groups SET updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    groupId
  );
}

export function getGroupSessions(groupId: string): WorkspaceGroupSessionRow[] {
  return getDB()
    .query<WorkspaceGroupSessionRow, [string]>(
      "SELECT * FROM workspace_group_sessions WHERE group_id = ? ORDER BY position ASC"
    )
    .all(groupId);
}

// --- Search ---

export function searchSessions(query: string, limit = 20): SessionRow[] {
  const pattern = `%${query}%`;
  return getDB()
    .query<SessionRow, [string, string, string, number]>(
      `SELECT * FROM sessions
       WHERE (first_prompt LIKE ?1 OR git_branch LIKE ?2 OR model LIKE ?3)
         AND is_archived = 0
       ORDER BY updated_at DESC
       LIMIT ?4`
    )
    .all(pattern, pattern, pattern, limit);
}
