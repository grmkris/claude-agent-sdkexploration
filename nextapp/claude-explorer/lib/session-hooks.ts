import type {
  HookEvent,
  HookCallbackMatcher,
  HookCallback,
  HookInput,
} from "@anthropic-ai/claude-agent-sdk/sdk";

import { execSync } from "node:child_process";

import { upsertSession, getSession } from "./explorer-db";

function hookCb(fn: (input: HookInput) => void): HookCallback {
  return async (input) => {
    try {
      const toolName = "tool_name" in input ? input.tool_name : undefined;
      console.log(
        `[session-hooks] ${input.hook_event_name} session=${input.session_id}${toolName ? ` tool=${toolName}` : ""}`
      );
      fn(input);
    } catch (e) {
      console.error("[session-hooks] error:", e);
    }
    return {};
  };
}

function wrap(fn: (input: HookInput) => void): HookCallbackMatcher[] {
  return [{ hooks: [hookCb(fn)] }];
}

export function createSessionHooks(
  source: string
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    SessionStart: wrap((input) => {
      if (input.hook_event_name !== "SessionStart") return;
      let gitBranch: string | null = null;
      try {
        gitBranch = execSync("git rev-parse --abbrev-ref HEAD", {
          cwd: input.cwd,
          timeout: 2000,
        })
          .toString()
          .trim();
      } catch {
        /* not a git repo */
      }
      upsertSession(input.session_id, {
        state: "thinking",
        project_path: input.cwd,
        model: input.model ?? null,
        git_branch: gitBranch,
        source,
        started_at: new Date().toISOString(),
      });
    }),

    UserPromptSubmit: wrap((input) => {
      if (input.hook_event_name !== "UserPromptSubmit") return;
      // Only write first_prompt if not already set
      const existing = getSession(input.session_id);
      upsertSession(input.session_id, {
        state: "thinking",
        // Belt-and-suspenders: if SessionStart didn't fire (e.g. CLI sessions or
        // SDK paths that skip it), capture project_path from cwd here instead.
        ...(existing?.project_path ? {} : { project_path: input.cwd }),
        ...(existing?.first_prompt
          ? {}
          : { first_prompt: input.prompt.slice(0, 200) }),
      });
    }),

    PreToolUse: wrap((input) => {
      if (input.hook_event_name !== "PreToolUse") return;
      upsertSession(input.session_id, {
        state: "tool_running",
        current_tool: input.tool_name,
      });
    }),

    PostToolUse: wrap((input) => {
      if (input.hook_event_name !== "PostToolUse") return;
      upsertSession(input.session_id, {
        state: "thinking",
        current_tool: null,
      });
    }),

    PostToolUseFailure: wrap((input) => {
      if (input.hook_event_name !== "PostToolUseFailure") return;
      upsertSession(input.session_id, {
        state: "thinking",
        current_tool: null,
      });
    }),

    SubagentStart: wrap((input) => {
      if (input.hook_event_name !== "SubagentStart") return;
      upsertSession(input.session_id, {
        state: "subagent_running",
      });
    }),

    SubagentStop: wrap((input) => {
      if (input.hook_event_name !== "SubagentStop") return;
      upsertSession(input.session_id, {
        state: "thinking",
      });
    }),

    PreCompact: wrap((input) => {
      if (input.hook_event_name !== "PreCompact") return;
      upsertSession(input.session_id, {
        state: "compacting",
      });
    }),

    Stop: wrap((input) => {
      if (input.hook_event_name !== "Stop") return;
      upsertSession(input.session_id, {
        state: "stopped",
        ended_at: new Date().toISOString(),
        current_tool: null,
      });
    }),

    SessionEnd: wrap((input) => {
      if (input.hook_event_name !== "SessionEnd") return;
      upsertSession(input.session_id, {
        state: "done",
        ended_at: new Date().toISOString(),
        current_tool: null,
      });
    }),
  };
}
