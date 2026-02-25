import type { HookInput } from "@anthropic-ai/claude-agent-sdk/sdk";

import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpDb = join(tmpdir(), `session-hooks-test-${Date.now()}.sqlite`);
process.env.EXPLORER_DB_PATH = tmpDb;

// Import AFTER setting env var
const { getSession, _resetDB } = await import("./explorer-db");
const { createSessionHooks } = await import("./session-hooks");

const SESSION_ID = "test-session-1";

const baseInput = {
  session_id: SESSION_ID,
  transcript_path: "/tmp/transcript.jsonl",
  cwd: "/tmp/test-project",
  permission_mode: "bypassPermissions",
};

function makeInput(overrides: Record<string, unknown>): HookInput {
  return { ...baseInput, ...overrides } as unknown as HookInput;
}

async function callHook(
  hooks: ReturnType<typeof createSessionHooks>,
  event: string,
  input: HookInput
) {
  const matchers = hooks[event as keyof typeof hooks];
  if (!matchers) throw new Error(`No hook for ${event}`);
  for (const matcher of matchers) {
    for (const hook of matcher.hooks) {
      await hook(input, undefined, { signal: new AbortController().signal });
    }
  }
}

beforeEach(() => {
  _resetDB();
  try {
    unlinkSync(tmpDb);
  } catch {}
});

afterAll(() => {
  _resetDB();
  try {
    unlinkSync(tmpDb);
  } catch {}
  try {
    unlinkSync(tmpDb + "-wal");
  } catch {}
  try {
    unlinkSync(tmpDb + "-shm");
  } catch {}
});

// --- Structure ---

describe("createSessionHooks", () => {
  test("returns correct hook events", () => {
    const hooks = createSessionHooks("test");
    const keys = Object.keys(hooks);
    expect(keys).toContain("SessionStart");
    expect(keys).toContain("UserPromptSubmit");
    expect(keys).toContain("PreToolUse");
    expect(keys).toContain("PostToolUse");
    expect(keys).toContain("PostToolUseFailure");
    expect(keys).toContain("SubagentStart");
    expect(keys).toContain("SubagentStop");
    expect(keys).toContain("PreCompact");
    expect(keys).toContain("Stop");
    expect(keys).toContain("SessionEnd");
  });

  test("skips non-mapped hooks", () => {
    const hooks = createSessionHooks("test");
    const keys = Object.keys(hooks);
    expect(keys).not.toContain("Notification");
    expect(keys).not.toContain("PermissionRequest");
    expect(keys).not.toContain("Setup");
    expect(keys).not.toContain("TeammateIdle");
    expect(keys).not.toContain("TaskCompleted");
  });
});

// --- SessionStart ---

describe("SessionStart hook", () => {
  test("creates session row with correct fields", async () => {
    const hooks = createSessionHooks("test");
    await callHook(
      hooks,
      "SessionStart",
      makeInput({
        hook_event_name: "SessionStart",
        source: "startup",
        model: "claude-sonnet-4-6",
      })
    );

    const row = getSession(SESSION_ID);
    expect(row).not.toBeNull();
    expect(row!.state).toBe("thinking");
    expect(row!.project_path).toBe("/tmp/test-project");
    expect(row!.model).toBe("claude-sonnet-4-6");
    expect(row!.source).toBe("test");
    expect(row!.started_at).toBeTruthy();
  });
});

// --- UserPromptSubmit ---

describe("UserPromptSubmit hook", () => {
  test("sets first_prompt on first call", async () => {
    const hooks = createSessionHooks("test");
    // Seed session first
    await callHook(
      hooks,
      "SessionStart",
      makeInput({ hook_event_name: "SessionStart", source: "startup" })
    );

    await callHook(
      hooks,
      "UserPromptSubmit",
      makeInput({ hook_event_name: "UserPromptSubmit", prompt: "Hello world" })
    );

    expect(getSession(SESSION_ID)!.first_prompt).toBe("Hello world");
  });

  test("does not overwrite first_prompt on second call", async () => {
    const hooks = createSessionHooks("test");
    await callHook(
      hooks,
      "SessionStart",
      makeInput({ hook_event_name: "SessionStart", source: "startup" })
    );
    await callHook(
      hooks,
      "UserPromptSubmit",
      makeInput({ hook_event_name: "UserPromptSubmit", prompt: "First" })
    );
    await callHook(
      hooks,
      "UserPromptSubmit",
      makeInput({ hook_event_name: "UserPromptSubmit", prompt: "Second" })
    );

    expect(getSession(SESSION_ID)!.first_prompt).toBe("First");
  });

  test("truncates to 200 chars", async () => {
    const hooks = createSessionHooks("test");
    await callHook(
      hooks,
      "SessionStart",
      makeInput({ hook_event_name: "SessionStart", source: "startup" })
    );

    const longPrompt = "x".repeat(300);
    await callHook(
      hooks,
      "UserPromptSubmit",
      makeInput({ hook_event_name: "UserPromptSubmit", prompt: longPrompt })
    );

    expect(getSession(SESSION_ID)!.first_prompt).toHaveLength(200);
  });
});

// --- PreToolUse ---

describe("PreToolUse hook", () => {
  test("sets state to tool_running with tool name", async () => {
    const hooks = createSessionHooks("test");
    await callHook(
      hooks,
      "SessionStart",
      makeInput({ hook_event_name: "SessionStart", source: "startup" })
    );
    await callHook(
      hooks,
      "PreToolUse",
      makeInput({
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: {},
        tool_use_id: "tu1",
      })
    );

    const row = getSession(SESSION_ID)!;
    expect(row.state).toBe("tool_running");
    expect(row.current_tool).toBe("Read");
  });
});

// --- PostToolUse ---

describe("PostToolUse hook", () => {
  test("clears tool and sets thinking", async () => {
    const hooks = createSessionHooks("test");
    await callHook(
      hooks,
      "SessionStart",
      makeInput({ hook_event_name: "SessionStart", source: "startup" })
    );
    await callHook(
      hooks,
      "PreToolUse",
      makeInput({
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: {},
        tool_use_id: "tu1",
      })
    );
    await callHook(
      hooks,
      "PostToolUse",
      makeInput({
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: {},
        tool_response: "ok",
        tool_use_id: "tu1",
      })
    );

    const row = getSession(SESSION_ID)!;
    expect(row.state).toBe("thinking");
    expect(row.current_tool).toBeNull();
  });
});

// --- PostToolUseFailure ---

describe("PostToolUseFailure hook", () => {
  test("clears tool and sets thinking", async () => {
    const hooks = createSessionHooks("test");
    await callHook(
      hooks,
      "SessionStart",
      makeInput({ hook_event_name: "SessionStart", source: "startup" })
    );
    await callHook(
      hooks,
      "PreToolUse",
      makeInput({
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: {},
        tool_use_id: "tu1",
      })
    );
    await callHook(
      hooks,
      "PostToolUseFailure",
      makeInput({
        hook_event_name: "PostToolUseFailure",
        tool_name: "Bash",
        tool_input: {},
        tool_use_id: "tu1",
        error: "command failed",
      })
    );

    const row = getSession(SESSION_ID)!;
    expect(row.state).toBe("thinking");
    expect(row.current_tool).toBeNull();
  });
});

// --- SubagentStart/Stop ---

describe("SubagentStart/Stop hooks", () => {
  test("start sets subagent_running", async () => {
    const hooks = createSessionHooks("test");
    await callHook(
      hooks,
      "SessionStart",
      makeInput({ hook_event_name: "SessionStart", source: "startup" })
    );
    await callHook(
      hooks,
      "SubagentStart",
      makeInput({
        hook_event_name: "SubagentStart",
        agent_id: "a1",
        agent_type: "researcher",
      })
    );

    expect(getSession(SESSION_ID)!.state).toBe("subagent_running");
  });

  test("stop sets thinking", async () => {
    const hooks = createSessionHooks("test");
    await callHook(
      hooks,
      "SessionStart",
      makeInput({ hook_event_name: "SessionStart", source: "startup" })
    );
    await callHook(
      hooks,
      "SubagentStart",
      makeInput({
        hook_event_name: "SubagentStart",
        agent_id: "a1",
        agent_type: "researcher",
      })
    );
    await callHook(
      hooks,
      "SubagentStop",
      makeInput({
        hook_event_name: "SubagentStop",
        stop_hook_active: false,
        agent_id: "a1",
        agent_transcript_path: "/tmp/t",
        agent_type: "researcher",
      })
    );

    expect(getSession(SESSION_ID)!.state).toBe("thinking");
  });
});

// --- PreCompact ---

describe("PreCompact hook", () => {
  test("sets compacting", async () => {
    const hooks = createSessionHooks("test");
    await callHook(
      hooks,
      "SessionStart",
      makeInput({ hook_event_name: "SessionStart", source: "startup" })
    );
    await callHook(
      hooks,
      "PreCompact",
      makeInput({
        hook_event_name: "PreCompact",
        trigger: "auto",
        custom_instructions: null,
      })
    );

    expect(getSession(SESSION_ID)!.state).toBe("compacting");
  });
});

// --- Stop ---

describe("Stop hook", () => {
  test("sets stopped with ended_at", async () => {
    const hooks = createSessionHooks("test");
    await callHook(
      hooks,
      "SessionStart",
      makeInput({ hook_event_name: "SessionStart", source: "startup" })
    );
    await callHook(
      hooks,
      "Stop",
      makeInput({ hook_event_name: "Stop", stop_hook_active: false })
    );

    const row = getSession(SESSION_ID)!;
    expect(row.state).toBe("stopped");
    expect(row.ended_at).toBeTruthy();
    expect(row.current_tool).toBeNull();
  });
});

// --- SessionEnd ---

describe("SessionEnd hook", () => {
  test("sets done with ended_at", async () => {
    const hooks = createSessionHooks("test");
    await callHook(
      hooks,
      "SessionStart",
      makeInput({ hook_event_name: "SessionStart", source: "startup" })
    );
    await callHook(
      hooks,
      "SessionEnd",
      makeInput({ hook_event_name: "SessionEnd", reason: "other" })
    );

    const row = getSession(SESSION_ID)!;
    expect(row.state).toBe("done");
    expect(row.ended_at).toBeTruthy();
  });
});

// --- Full lifecycle ---

describe("full lifecycle", () => {
  test("SessionStart → PreToolUse → PostToolUse → SessionEnd", async () => {
    const hooks = createSessionHooks("chat");

    await callHook(
      hooks,
      "SessionStart",
      makeInput({
        hook_event_name: "SessionStart",
        source: "startup",
        model: "opus",
      })
    );
    expect(getSession(SESSION_ID)!.state).toBe("thinking");

    await callHook(
      hooks,
      "UserPromptSubmit",
      makeInput({ hook_event_name: "UserPromptSubmit", prompt: "Fix the bug" })
    );
    expect(getSession(SESSION_ID)!.first_prompt).toBe("Fix the bug");

    await callHook(
      hooks,
      "PreToolUse",
      makeInput({
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: {},
        tool_use_id: "tu1",
      })
    );
    expect(getSession(SESSION_ID)!.state).toBe("tool_running");
    expect(getSession(SESSION_ID)!.current_tool).toBe("Edit");

    await callHook(
      hooks,
      "PostToolUse",
      makeInput({
        hook_event_name: "PostToolUse",
        tool_name: "Edit",
        tool_input: {},
        tool_response: "ok",
        tool_use_id: "tu1",
      })
    );
    expect(getSession(SESSION_ID)!.state).toBe("thinking");
    expect(getSession(SESSION_ID)!.current_tool).toBeNull();

    await callHook(
      hooks,
      "SessionEnd",
      makeInput({ hook_event_name: "SessionEnd", reason: "other" })
    );
    const final = getSession(SESSION_ID)!;
    expect(final.state).toBe("done");
    expect(final.ended_at).toBeTruthy();
    expect(final.source).toBe("chat");
    expect(final.model).toBe("opus");
  });
});
