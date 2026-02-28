/**
 * spawn-agent.ts — Shared agent spawning utility.
 *
 * Provides a unified `spawnAgent()` async generator that encapsulates the
 * common pattern shared by all executors (chat, cron, webhook, email,
 * linear chat). Eliminates ~80 lines of duplicated boilerplate per executor:
 *
 *   - CLAUDECODE env stripping
 *   - Explorer MCP config building
 *   - MCP server merging (user + project + local)
 *   - Agent context injection via system prompt
 *   - Session ID capture from init message
 *   - project_path double-write (workaround for SDK hook cwd unreliability)
 *   - Result metrics capture
 *   - settingSources for CLAUDE.md loading
 */

import type {
  McpServerConfig,
  PermissionMode,
  SettingSource,
} from "@anthropic-ai/claude-agent-sdk/sdk";

import { query } from "@anthropic-ai/claude-agent-sdk";

import type { SDKMessage } from "./types";

import { buildAgentContext } from "./agent-context";
import { resolveSlugToPath, USER_HOME, readProjectEnv } from "./claude-fs";
import { upsertSession } from "./explorer-db";
import { resolveAllMcpServers, type McpResolveOptions } from "./mcp-resolver";
import { createSessionHooks } from "./session-hooks";

// Strip CLAUDECODE to allow the Agent SDK to spawn inside a Claude Code container
const { CLAUDECODE: _CC, ...cleanEnv } = process.env;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentSource =
  | "chat"
  | "root_chat"
  | "cron"
  | "webhook"
  | "email"
  | "linear_chat";

export interface SpawnAgentOptions {
  /** The prompt to send to the agent. */
  prompt: string | { type: string; [key: string]: unknown };

  /** Which executor is spawning the agent. */
  source: AgentSource;

  /** Explorer project slug — resolved to cwd + used for integration lookups. */
  projectSlug?: string;

  /** Direct cwd override (takes priority over projectSlug resolution). */
  cwd?: string;

  /** Claude model to use. Defaults to claude-opus-4-6. */
  model?: string;

  /** Extra text to append to the system prompt (in addition to auto-context). */
  systemPromptAppend?: string;

  /** Resume an existing session. */
  resume?: string;

  /** Fork session options. */
  forkSession?: boolean;
  forkSessionId?: string;
  resumeSessionAt?: string;

  /** Additional MCP servers to merge (beyond auto-resolved ones). */
  extraMcpServers?: Record<string, unknown>;

  /** MCP resolution options (optional MCP filtering). */
  mcpResolveOptions?: McpResolveOptions;

  /** Skip MCP resolution from disk — only use explorer + extraMcpServers. */
  skipMcpResolution?: boolean;

  /** Permission mode. Defaults to "bypassPermissions". */
  permissionMode?: PermissionMode;

  /** Abort controller. */
  abortController?: AbortController;

  /** Additional env vars to merge. */
  env?: Record<string, string>;

  /** Thinking configuration. */
  thinking?: { type: "adaptive" } | { type: "disabled" };

  /** canUseTool callback (for interactive chat AskUserQuestion/ExitPlanMode). */
  canUseTool?: (
    toolName: string,
    toolInput: unknown,
    opts: { toolUseID: string; signal?: AbortSignal }
  ) => Promise<
    | { behavior: "allow"; updatedInput?: Record<string, unknown> }
    | { behavior: "deny"; message: string }
  >;

  /** stderr callback. */
  stderr?: (data: string) => void;

  /** Called when the session ID is captured from the init message. */
  onSessionId?: (sessionId: string) => void;

  /** Called with result metrics when the agent finishes. */
  onResult?: (result: AgentResult) => void;
}

export interface AgentResult {
  sessionId?: string;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  numTurns?: number;
  durationMs?: number;
  isError?: boolean;
  errorSubtype?: string;
}

// ---------------------------------------------------------------------------
// Main spawn function
// ---------------------------------------------------------------------------

/**
 * Spawn a Claude agent session. Returns an async generator of SDK messages.
 *
 * Handles all common setup:
 *   1. Resolves cwd from projectSlug or direct cwd
 *   2. Builds and merges MCP servers (explorer + user + project + local)
 *   3. Builds agent context and appends to system prompt
 *   4. Calls query() with unified options
 *   5. Captures session ID and persists project_path
 *   6. Captures result metrics
 *   7. Yields all SDK messages to caller
 */
export async function* spawnAgent(
  opts: SpawnAgentOptions
): AsyncGenerator<SDKMessage> {
  // 1. Resolve cwd
  let cwd = opts.cwd;
  if (!cwd && opts.projectSlug) {
    if (opts.projectSlug === "__root__") {
      cwd = USER_HOME;
    } else {
      cwd = await resolveSlugToPath(opts.projectSlug);
    }
  }

  // 2. Build MCP servers
  let mcpServers: Record<string, unknown>;
  if (opts.skipMcpResolution) {
    // Minimal mode: just explorer + whatever extra the caller provides
    const { buildExplorerMcpConfig } = await import("./mcp-resolver");
    const explorer = buildExplorerMcpConfig();
    mcpServers = {
      [explorer.name]: explorer.config,
      ...opts.extraMcpServers,
    };
  } else {
    // Full resolution: explorer + user + project + local MCPs
    mcpServers = await resolveAllMcpServers(cwd, opts.mcpResolveOptions);
    if (opts.extraMcpServers) {
      Object.assign(mcpServers, opts.extraMcpServers);
    }
  }

  // 3. Build agent context for system prompt
  const autoContext = await buildAgentContext({
    cwd,
    projectSlug: opts.projectSlug,
    source: opts.source,
    extraContext: opts.systemPromptAppend,
  });

  const systemPrompt = autoContext
    ? {
        type: "preset" as const,
        preset: "claude_code" as const,
        append: autoContext,
      }
    : undefined;

  // 4. Merge per-project env vars
  let projectEnv: Record<string, string> = {};
  if (cwd) {
    try {
      projectEnv = await readProjectEnv(cwd);
    } catch {
      // best-effort — ignore if project has no env config
    }
  }

  // 5. Determine permission mode
  const permissionMode = (opts.permissionMode ??
    "bypassPermissions") as PermissionMode;
  const needsDangerous = permissionMode === "bypassPermissions";

  // 6. settingSources — enable project CLAUDE.md when we have a real cwd
  const settingSources: SettingSource[] = [];
  if (cwd && cwd !== USER_HOME) {
    settingSources.push("project");
  }

  // 7. Call query()
  const conversation = query({
    prompt: opts.prompt as string,
    options: {
      model: opts.model ?? "claude-opus-4-6",
      executable: "bun",
      permissionMode,
      allowDangerouslySkipPermissions: needsDangerous,
      env: { ...cleanEnv, ...projectEnv, ...opts.env },
      ...(opts.abortController
        ? { abortController: opts.abortController }
        : {}),
      ...(opts.stderr ? { stderr: opts.stderr } : {}),
      ...(opts.thinking ? { thinking: opts.thinking } : {}),
      ...(opts.canUseTool ? { canUseTool: opts.canUseTool } : {}),
      ...(systemPrompt ? { systemPrompt } : {}),
      mcpServers: mcpServers as Record<string, McpServerConfig>,
      hooks: createSessionHooks(opts.source),
      ...(opts.resume ? { resume: opts.resume } : {}),
      ...(opts.forkSession ? { forkSession: true } : {}),
      ...(opts.resumeSessionAt
        ? { resumeSessionAt: opts.resumeSessionAt }
        : {}),
      ...(opts.forkSessionId ? { sessionId: opts.forkSessionId } : {}),
      ...(cwd ? { cwd } : {}),
      ...(settingSources.length > 0 ? { settingSources } : {}),
    },
  });

  // 8. Drain the iterator, capturing session ID and result metrics
  let capturedSessionId: string | undefined;

  for await (const msg of conversation) {
    // Capture session_id from init message
    if (
      !capturedSessionId &&
      msg &&
      typeof msg === "object" &&
      "type" in msg &&
      (msg as { type: string }).type === "system" &&
      "session_id" in msg
    ) {
      capturedSessionId = (msg as { session_id: string }).session_id;
      // Explicitly persist project_path — SDK hook input.cwd is unreliable.
      upsertSession(capturedSessionId, {
        project_path: cwd ?? process.cwd(),
      });
      opts.onSessionId?.(capturedSessionId);
    }

    // Capture result metrics
    if (
      capturedSessionId &&
      msg &&
      typeof msg === "object" &&
      "type" in msg &&
      (msg as { type: string }).type === "result"
    ) {
      const r = msg as {
        total_cost_usd?: number;
        usage?: { input_tokens?: number; output_tokens?: number };
        num_turns?: number;
        duration_ms?: number;
        is_error?: boolean;
        subtype?: string;
      };
      upsertSession(capturedSessionId, {
        cost_usd: r.total_cost_usd ?? null,
        input_tokens: r.usage?.input_tokens ?? null,
        output_tokens: r.usage?.output_tokens ?? null,
        num_turns: r.num_turns ?? null,
        duration_ms: r.duration_ms ?? null,
        ...(r.is_error ? { state: "error", error: r.subtype ?? "error" } : {}),
      });
      opts.onResult?.({
        sessionId: capturedSessionId,
        costUsd: r.total_cost_usd,
        inputTokens: r.usage?.input_tokens,
        outputTokens: r.usage?.output_tokens,
        numTurns: r.num_turns,
        durationMs: r.duration_ms,
        isError: r.is_error,
        errorSubtype: r.subtype,
      });
    }

    yield msg;
  }
}
