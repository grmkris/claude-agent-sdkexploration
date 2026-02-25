import { Database } from "bun:sqlite";
import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpDb = join(tmpdir(), `explorer-db-test-${Date.now()}.sqlite`);
process.env.EXPLORER_DB_PATH = tmpDb;

// Import AFTER setting env var
const {
  upsertSession,
  getSession,
  getActiveSessions,
  getProjectSessions,
  getAllRecentSessions,
  cleanOldSessions,
  _resetDB,
} = await import("./explorer-db");
const { getSessionEventBus } = await import("./event-bus");

beforeEach(() => {
  _resetDB();
  // Delete and recreate — getDB() will reinitialize
  try {
    unlinkSync(tmpDb);
  } catch {}
});

afterAll(() => {
  _resetDB();
  try {
    unlinkSync(tmpDb);
  } catch {}
  // Also clean WAL/SHM files
  try {
    unlinkSync(tmpDb + "-wal");
  } catch {}
  try {
    unlinkSync(tmpDb + "-shm");
  } catch {}
});

// --- upsertSession ---

describe("upsertSession", () => {
  test("insert new session with defaults", () => {
    upsertSession("s1", { state: "thinking", project_path: "/tmp/proj" });
    const row = getSession("s1");
    expect(row).not.toBeNull();
    expect(row!.session_id).toBe("s1");
    expect(row!.state).toBe("thinking");
    expect(row!.project_path).toBe("/tmp/proj");
    expect(row!.current_tool).toBeNull();
    expect(row!.source).toBeNull();
    expect(row!.model).toBeNull();
    expect(row!.first_prompt).toBeNull();
    expect(row!.started_at).toBeTruthy();
    expect(row!.updated_at).toBeTruthy();
  });

  test("update existing session patches only provided fields", () => {
    upsertSession("s1", {
      state: "thinking",
      project_path: "/tmp/proj",
      first_prompt: "hello",
    });
    const before = getSession("s1")!;

    // Small delay to get different updated_at
    const delay = new Promise((r) => setTimeout(r, 10));
    return delay.then(() => {
      upsertSession("s1", { state: "tool_running", current_tool: "Read" });
      const after = getSession("s1")!;
      expect(after.state).toBe("tool_running");
      expect(after.current_tool).toBe("Read");
      // Preserved from original insert
      expect(after.first_prompt).toBe("hello");
      expect(after.project_path).toBe("/tmp/proj");
      // updated_at changed
      expect(after.updated_at >= before.updated_at).toBe(true);
    });
  });

  test("null values in patch clear fields", () => {
    upsertSession("s1", { state: "tool_running", current_tool: "Bash" });
    expect(getSession("s1")!.current_tool).toBe("Bash");

    upsertSession("s1", { state: "thinking", current_tool: null });
    expect(getSession("s1")!.current_tool).toBeNull();
  });
});

// --- getSession ---

describe("getSession", () => {
  test("returns null for unknown id", () => {
    expect(getSession("nonexistent")).toBeNull();
  });

  test("returns full row with all fields", () => {
    upsertSession("s1", {
      state: "done",
      project_path: "/p",
      current_tool: null,
      source: "chat",
      model: "sonnet",
      first_prompt: "hi",
      cost_usd: 0.05,
      input_tokens: 1000,
      output_tokens: 500,
      num_turns: 3,
      duration_ms: 5000,
      ended_at: new Date().toISOString(),
    });
    const row = getSession("s1")!;
    expect(row.source).toBe("chat");
    expect(row.model).toBe("sonnet");
    expect(row.cost_usd).toBe(0.05);
    expect(row.input_tokens).toBe(1000);
    expect(row.output_tokens).toBe(500);
    expect(row.num_turns).toBe(3);
    expect(row.duration_ms).toBe(5000);
    expect(row.ended_at).toBeTruthy();
  });
});

// --- getActiveSessions ---

describe("getActiveSessions", () => {
  test("filters terminal states", () => {
    upsertSession("active1", { state: "thinking" });
    upsertSession("active2", { state: "tool_running" });
    upsertSession("done1", { state: "done" });
    upsertSession("stopped1", { state: "stopped" });
    upsertSession("error1", { state: "error" });

    const active = getActiveSessions();
    const ids = active.map((r) => r.session_id);
    expect(ids).toContain("active1");
    expect(ids).toContain("active2");
    expect(ids).not.toContain("done1");
    expect(ids).not.toContain("stopped1");
    expect(ids).not.toContain("error1");
  });

  test("ordered by updated_at desc", () => {
    // Insert in order with slight time gaps
    upsertSession("old", { state: "thinking" });
    upsertSession("mid", { state: "thinking" });
    upsertSession("new", { state: "thinking" });

    const active = getActiveSessions();
    // Most recently updated first (last inserted = last updated)
    expect(active[0].session_id).toBe("new");
  });
});

// --- getProjectSessions ---

describe("getProjectSessions", () => {
  test("filters by project_path", () => {
    upsertSession("s1", { state: "done", project_path: "/proj/a" });
    upsertSession("s2", { state: "done", project_path: "/proj/b" });
    upsertSession("s3", { state: "thinking", project_path: "/proj/a" });

    const projA = getProjectSessions("/proj/a");
    expect(projA).toHaveLength(2);
    expect(projA.every((r) => r.project_path === "/proj/a")).toBe(true);
  });

  test("respects limit", () => {
    for (let i = 0; i < 5; i++) {
      upsertSession(`s${i}`, { state: "done", project_path: "/proj" });
    }
    expect(getProjectSessions("/proj", 2)).toHaveLength(2);
  });
});

// --- getAllRecentSessions ---

describe("getAllRecentSessions", () => {
  test("returns all regardless of state", () => {
    upsertSession("s1", { state: "thinking" });
    upsertSession("s2", { state: "done" });
    upsertSession("s3", { state: "error" });

    const all = getAllRecentSessions();
    expect(all).toHaveLength(3);
  });

  test("respects limit", () => {
    for (let i = 0; i < 5; i++) {
      upsertSession(`s${i}`, { state: "done" });
    }
    expect(getAllRecentSessions(2)).toHaveLength(2);
  });
});

// --- cleanOldSessions ---

describe("cleanOldSessions", () => {
  test("deletes old terminal sessions", () => {
    // Insert a "done" session with an old updated_at
    upsertSession("old-done", { state: "done" });
    // Manually backdate it
    const d = new Database(tmpDb);
    const oldDate = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    d.query("UPDATE sessions SET updated_at = ? WHERE session_id = ?").run(
      oldDate,
      "old-done"
    );
    d.close();

    // Re-open via our module
    _resetDB();
    cleanOldSessions(7 * 24 * 60 * 60 * 1000);
    expect(getSession("old-done")).toBeNull();
  });

  test("preserves active sessions regardless of age", () => {
    upsertSession("old-active", { state: "thinking" });
    const d = new Database(tmpDb);
    const oldDate = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    d.query("UPDATE sessions SET updated_at = ? WHERE session_id = ?").run(
      oldDate,
      "old-active"
    );
    d.close();

    _resetDB();
    cleanOldSessions(7 * 24 * 60 * 60 * 1000);
    expect(getSession("old-active")).not.toBeNull();
  });

  test("preserves recent terminal sessions", () => {
    upsertSession("recent-done", { state: "done" });
    // updated_at is "now" — should survive cleanup
    cleanOldSessions(7 * 24 * 60 * 60 * 1000);
    expect(getSession("recent-done")).not.toBeNull();
  });
});

// --- event emission ---

describe("event emission", () => {
  test("upsert emits session:state event", () => {
    const bus = getSessionEventBus();
    let received: unknown = null;
    const handler = (evt: unknown) => {
      received = evt;
    };
    bus.on("session:state", handler);

    upsertSession("s-emit", { state: "thinking", project_path: "/test" });

    bus.off("session:state", handler);

    expect(received).not.toBeNull();
    const evt = received as {
      sessionId: string;
      state: string;
      projectPath: string;
    };
    expect(evt.sessionId).toBe("s-emit");
    expect(evt.state).toBe("thinking");
    expect(evt.projectPath).toBe("/test");
  });
});
