import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk/sdk";

import { query } from "@anthropic-ai/claude-agent-sdk";
import { os, eventIterator } from "@orpc/server";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { z } from "zod";

import type { SessionRow, SessionState as DbSessionState } from "./explorer-db";
import type { SDKMessage } from "./types";

import {
  listProjects,
  getSessionMessages,
  getSessionLastAssistantText,
  resolveSlugToPath,
  readProjectMcpConfig,
  readUserMcpServers,
  readLocalMcpServers,
  readProjectClaudeMd,
  readProjectAgents,
  listDirectory,
  readUserSkills,
  readUserCommands,
  readProjectCommands,
  readFileContent,
  readGlobalStats,
  readStatsCache,
  readSessionFacets,
  createDirectory,
  createProjectDirectory,
  invalidateSlugCache,
  resolveSlugForCwd,
  runClaudeCli,
  inspectMcpTools,
  writeUserSkill,
  removeUserSkill,
  writeUserCommand,
  removeUserCommand,
  writeProjectCommand,
  removeProjectCommand,
  readSkillContent,
  readCommandContent,
  readProjectEnv,
  writeProjectEnv,
  getGitStatus,
  getGitFileDiff,
  gitPull,
  gitStageAll,
  gitCommit,
  gitCommitAndPush,
  getGitLog,
  getGitCommitFiles,
  getGitCommitDiff,
  findProjectPathForSession,
  getGitWorktrees,
} from "./claude-fs";
import { sendEmail } from "./email";
import {
  upsertSession,
  getSession as getDbSession,
  getActiveSessions as getDbActiveSessions,
  getProjectSessions as getDbProjectSessions,
  getAllRecentSessions as getDbAllRecentSessions,
  upsertPendingQuestion,
  setPrefilledAnswers,
  getPendingQuestion,
  deletePendingQuestion,
  deletePendingQuestionsForSession,
} from "./explorer-db";
import {
  getFavorites,
  toggleFavoriteProject,
  toggleFavoriteSession,
  getCrons,
  addCron,
  removeCron,
  toggleCron,
  getMessages as getAgentMessages,
  addMessage,
  markMessageRead,
  getUnreadBySession,
  getWebhooks,
  addWebhook,
  removeWebhook,
  toggleWebhook,
  getWebhookEvents,
  getCronEvents,
  getIntegrations,
  addIntegration,
  removeIntegration,
  toggleIntegration,
  updateIntegrationError,
  getApiKeys,
  getApiKey,
  addApiKey,
  updateApiKey,
  removeApiKey,
  resolveIntegrationToken,
  getRootPrimarySessionId,
  setRootPrimarySessionId,
  getEmailConfigs,
  getEmailConfigBySlug,
  setEmailConfig,
  removeEmailConfig,
  addEmailEvent,
  getEmailEvents,
  saveOAuthApp,
  getOAuthApp,
  removeOAuthApp,
} from "./explorer-store";
import {
  getProvider,
  getCachedWidgets,
  getStaleCachedWidgets,
  setCachedWidgets,
} from "./integration-providers";
import {
  emitActivity,
  updateSessionPlan,
  setDelegate,
  moveToStarted,
  createIssue as linearCreateIssue,
  updateIssue as linearUpdateIssue,
  addComment as linearAddComment,
  listAssignedIssues,
  createSessionOnIssue,
} from "./linear-agent";
import {
  SUGGESTED_SKILLS,
  MCP_CATALOG,
  type SkillsShSkill,
} from "./mcp-catalog";
import {
  ProjectSchema,
  SessionMetaSchema,
  RecentSessionSchema,
  FavoritesSchema,
  ParsedMessageSchema,
  CronJobSchema,
  AgentMessageSchema,
  TmuxPaneSchema,
  WebhookConfigSchema,
  WebhookEventSchema,
  CronEventSchema,
  GlobalStatsSchema,
  DailyActivitySchema,
  SessionFacetSchema,
  IntegrationConfigSchema,
  IntegrationWidgetSchema,
  ApiKeySchema,
  ApiKeyProviderSchema,
  ServerConfigSchema,
  WorkspaceEmailConfigSchema,
  EmailEventSchema,
  GitWorktreeSchema,
  TmuxSessionSchema,
} from "./schemas";
import { createSessionHooks } from "./session-hooks";
import { getTmuxPanes, getTmuxSessions } from "./tmux";
import {
  getCatalog,
  autoCreateLinearWebhook,
  autoCreateGithubWebhook,
} from "./webhook-event-catalog";

const USER_HOME = process.env.CLAUDE_CONFIG_DIR
  ? dirname(process.env.CLAUDE_CONFIG_DIR)
  : homedir();

// Strip CLAUDECODE to allow the Agent SDK to spawn inside a Claude Code container
const { CLAUDECODE: _CC, ...cleanEnv } = process.env;

// --- DB → Legacy mappers ---

type LegacySessionState = "active" | "idle" | "stale";

function mapDbStateToLegacy(dbState: DbSessionState): LegacySessionState {
  switch (dbState) {
    case "thinking":
    case "initializing":
    case "tool_running":
    case "subagent_running":
    case "compacting":
      return "active";
    case "waiting_for_permission":
    case "stopped":
    case "done":
      return "idle";
    case "error":
      return "stale";
    default:
      return "idle";
  }
}

function sessionRowToMeta(row: SessionRow): import("./schemas").SessionMeta {
  return {
    id: row.session_id,
    firstPrompt: row.first_prompt ?? "",
    timestamp: row.started_at,
    lastModified: row.updated_at,
    model: row.model ?? "",
    gitBranch: row.git_branch ?? "",
    resumeCommand: row.project_path
      ? `cd ${row.project_path} && claude --resume ${row.session_id}`
      : `claude --resume ${row.session_id}`,
    sessionState: mapDbStateToLegacy(row.state),
    source: row.source ?? null,
  };
}

async function sessionRowToRecent(
  row: SessionRow
): Promise<import("./schemas").RecentSession> {
  let projectPath = row.project_path;

  // Backfill: if project_path was never captured (pre-fix sessions where the
  // SDK hook's input.cwd was undefined), search the filesystem for the .jsonl.
  if (!projectPath) {
    const found = await findProjectPathForSession(row.session_id);
    if (found) {
      projectPath = found;
      // Persist so subsequent queries don't need to search again.
      upsertSession(row.session_id, { project_path: found });
    } else {
      // Truly unknown — fall back to root workspace.
      projectPath = USER_HOME;
    }
  }

  // Root workspace sessions navigate to /chat/{id}, not /project/…/chat/{id}.
  const isRoot = projectPath === USER_HOME;
  const projectSlug = isRoot ? null : await resolveSlugForCwd(projectPath);

  return {
    ...sessionRowToMeta(row),
    projectSlug,
    projectPath,
  };
}

// --- Projects & Sessions ---

const resolveSlugProc = os
  .input(z.object({ slug: z.string() }))
  .output(z.object({ path: z.string() }))
  .handler(async ({ input }) => ({
    path: await resolveSlugToPath(input.slug),
  }));

const listProjectsProc = os
  .output(z.array(ProjectSchema))
  .handler(async () => listProjects());

const listSessionsProc = os
  .input(z.object({ slug: z.string(), limit: z.number().optional() }))
  .output(z.array(SessionMetaSchema))
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    const rows = getDbProjectSessions(projectPath, input.limit ?? 30);
    return rows.map(sessionRowToMeta);
  });

const getMessagesProc = os
  .input(z.object({ slug: z.string(), sessionId: z.string() }))
  .output(z.array(ParsedMessageSchema))
  .handler(async ({ input }) =>
    getSessionMessages(input.slug, input.sessionId)
  );

const recentSessionsProc = os
  .input(z.object({ limit: z.number().optional() }))
  .output(z.array(RecentSessionSchema))
  .handler(async ({ input }) => {
    const rows = getDbAllRecentSessions(input.limit ?? 20);
    return Promise.all(rows.map(sessionRowToRecent));
  });

const timelineSessionsProc = os
  .input(
    z.object({ limit: z.number().optional(), slug: z.string().optional() })
  )
  .output(z.array(RecentSessionSchema))
  .handler(async ({ input }) => {
    if (input.slug) {
      const projectPath = await resolveSlugToPath(input.slug);
      const rows = getDbProjectSessions(projectPath, input.limit ?? 50);
      return Promise.all(rows.map(sessionRowToRecent));
    }
    const rows = getDbAllRecentSessions(input.limit ?? 50);
    return Promise.all(rows.map(sessionRowToRecent));
  });

// --- Session Preview ---

const sessionPreviewProc = os
  .input(z.object({ sessionId: z.string(), slug: z.string() }))
  .output(
    z.object({
      lastAssistantMessage: z.string().nullable(),
    })
  )
  .handler(async ({ input }) => {
    const lastAssistantMessage = await getSessionLastAssistantText(
      input.slug,
      input.sessionId
    );
    return { lastAssistantMessage };
  });

// --- Archive ---

const archiveSessionProc = os
  .input(
    z.object({
      sessionId: z.string(),
      archived: z.boolean().optional(), // true = archive (default), false = unarchive
    })
  )
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => {
    upsertSession(input.sessionId, {
      is_archived: (input.archived ?? true) ? 1 : 0,
    });
    return { success: true };
  });

// --- Favorites ---

const getFavoritesProc = os
  .output(FavoritesSchema)
  .handler(async () => getFavorites());

const toggleFavoriteProjectProc = os
  .input(z.object({ slug: z.string() }))
  .output(FavoritesSchema)
  .handler(async ({ input }) => toggleFavoriteProject(input.slug));

const toggleFavoriteSessionProc = os
  .input(z.object({ id: z.string() }))
  .output(FavoritesSchema)
  .handler(async ({ input }) => toggleFavoriteSession(input.id));

// --- Crons ---

const listCronsProc = os
  .output(z.array(CronJobSchema))
  .handler(async () => getCrons());

const createCronProc = os
  .input(
    z.object({
      expression: z.string(),
      prompt: z.string(),
      projectSlug: z.string(),
      projectPath: z.string().optional(),
      sessionId: z.string().optional(),
    })
  )
  .output(CronJobSchema)
  .handler(async ({ input }) => {
    const cron = {
      id: crypto.randomUUID(),
      expression: input.expression,
      prompt: input.prompt,
      projectSlug: input.projectSlug,
      projectPath: input.projectPath,
      sessionId: input.sessionId,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    return addCron(cron);
  });

const deleteCronProc = os
  .input(z.object({ id: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => ({ success: await removeCron(input.id) }));

const toggleCronProc = os
  .input(z.object({ id: z.string() }))
  .output(CronJobSchema.nullable())
  .handler(async ({ input }) => toggleCron(input.id));

// --- Agent Messages ---

const sendMessageProc = os
  .input(
    z.object({
      from: z.object({ projectSlug: z.string(), sessionId: z.string() }),
      to: z.object({
        projectSlug: z.string(),
        sessionId: z.string().optional(),
      }),
      body: z.string(),
    })
  )
  .output(AgentMessageSchema)
  .handler(async ({ input }) => {
    const msg = {
      id: crypto.randomUUID(),
      from: input.from,
      to: input.to,
      body: input.body,
      timestamp: new Date().toISOString(),
      read: false,
    };
    return addMessage(msg);
  });

const listAgentMessagesProc = os
  .input(
    z.object({ projectSlug: z.string(), sessionId: z.string().optional() })
  )
  .output(z.array(AgentMessageSchema))
  .handler(async ({ input }) =>
    getAgentMessages(input.projectSlug, input.sessionId)
  );

const markReadProc = os
  .input(z.object({ id: z.string() }))
  .output(AgentMessageSchema.nullable())
  .handler(async ({ input }) => markMessageRead(input.id));

const unreadBySessionProc = os
  .input(z.object({ projectSlug: z.string() }))
  .output(z.record(z.string(), z.number()))
  .handler(async ({ input }) => getUnreadBySession(input.projectSlug));

// --- Tmux ---

const tmuxPanesProc = os
  .output(z.array(TmuxPaneSchema))
  .handler(async () => getTmuxPanes());

const tmuxSessionsProc = os
  .output(z.array(TmuxSessionSchema))
  .handler(async () => getTmuxSessions());

// --- Git Worktrees ---

const gitWorktreesProc = os
  .input(z.object({ slug: z.string() }))
  .output(z.array(GitWorktreeSchema))
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    return getGitWorktrees(projectPath);
  });

// --- Server Config ---

const serverConfigProc = os.output(ServerConfigSchema).handler(async () => ({
  sshHost: process.env.SSH_HOST ?? null,
  homeDir: USER_HOME,
}));

// --- Chat ---

const ImageInputSchema = z.object({
  base64: z.string(),
  mediaType: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]),
});

// Module-level map of pending AskUserQuestion tool calls awaiting user answers.
// Key: toolUseId. Value: { resolve, sessionId, toolInput }.
const pendingAnswers = new Map<
  string,
  {
    resolve: (
      result:
        | { behavior: "allow"; updatedInput?: Record<string, unknown> }
        | { behavior: "deny"; message: string }
    ) => void;
    sessionId: string;
    toolInput: Record<string, unknown>;
  }
>();

// Module-level map of pending ExitPlanMode tool calls awaiting user approval.
// Key: toolUseId. Value: { resolve, sessionId, planText, allowedPrompts, toolInput }.
const pendingExitPlanMode = new Map<
  string,
  {
    resolve: (
      result:
        | { behavior: "allow"; updatedInput?: Record<string, unknown> }
        | { behavior: "deny"; message: string }
    ) => void;
    sessionId: string;
    planText: string;
    allowedPrompts: Array<{ tool: string; prompt: string }>;
    toolInput: Record<string, unknown>;
  }
>();

// Track which sessions have an active SSE stream. Used by answerQuestionProc
// to detect when a stream has died (so it can return needsResume: true even
// though the in-memory promise was "resolved" via deny on stream end).
const activeStreams = new Set<string>();

function cleanupPendingAnswers(sessionId: string) {
  activeStreams.delete(sessionId);
  for (const [toolUseId, entry] of pendingAnswers.entries()) {
    if (entry.sessionId === sessionId) {
      entry.resolve({ behavior: "deny", message: "Session ended" });
      pendingAnswers.delete(toolUseId);
      // NOTE: intentionally do NOT delete the DB row here. If the user submits
      // an answer after the SSE stream dies, answerQuestionProc will find the
      // DB row and return needsResume: true so the frontend reopens the stream.
    }
  }
  // Also clean up pending ExitPlanMode calls for this session
  for (const [toolUseId, entry] of pendingExitPlanMode.entries()) {
    if (entry.sessionId === sessionId) {
      entry.resolve({ behavior: "deny", message: "Session ended" });
      pendingExitPlanMode.delete(toolUseId);
    }
  }
  // Also clean up any DB rows for this session that lost their in-memory promise
  // (e.g. orphaned rows from a previous server run).
  deletePendingQuestionsForSession(sessionId);
}

function buildPromptArg(
  prompt: string,
  resume: string | undefined,
  images: { base64: string; mediaType: string }[] | undefined
): string | AsyncIterable<SDKUserMessage> {
  if (!images?.length) return prompt;

  const sessionId = resume ?? crypto.randomUUID();
  const userMessage: SDKUserMessage = {
    type: "user",
    message: {
      role: "user",
      content: [
        ...images.map((img) => ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: img.mediaType as
              | "image/jpeg"
              | "image/png"
              | "image/gif"
              | "image/webp",
            data: img.base64,
          },
        })),
        { type: "text" as const, text: prompt },
      ],
    },
    parent_tool_use_id: null,
    session_id: sessionId,
  };

  return (async function* () {
    yield userMessage;
  })();
}

const chatProc = os
  .input(
    z.object({
      prompt: z.string(),
      resume: z.string().optional(),
      cwd: z.string().optional(),
      images: z.array(ImageInputSchema).optional(),
      thinking: z.enum(["adaptive", "disabled"]).optional(),
      permissionMode: z
        .enum([
          "bypassPermissions",
          "default",
          "acceptEdits",
          "plan",
          "dontAsk",
        ])
        .optional(),
    })
  )
  .output(eventIterator(z.custom<SDKMessage>()))
  .handler(async function* ({ input, signal }) {
    const explorerServerPath = join(
      process.cwd(),
      "tools",
      "explorer-server.ts"
    );
    const baseUrl =
      process.env.EXPLORER_BASE_URL ??
      `http://localhost:${process.env.PORT ?? 3000}`;

    const ac = new AbortController();
    signal?.addEventListener("abort", () => ac.abort(), { once: true });

    let sessionId: string | undefined;

    // Cleanup pending answers if the request is aborted
    signal?.addEventListener(
      "abort",
      () => {
        if (sessionId) cleanupPendingAnswers(sessionId);
      },
      { once: true }
    );

    try {
      // Merge per-project env vars (if cwd resolves to a registered project)
      let projectEnv: Record<string, string> = {};
      if (input.cwd) {
        try {
          projectEnv = await readProjectEnv(input.cwd);
        } catch {
          // best-effort — ignore if project has no env config
        }
      }

      const effectivePermMode = input.permissionMode ?? "bypassPermissions";
      const needsDangerous = effectivePermMode === "bypassPermissions";

      // Thinking config
      const thinkingConfig =
        input.thinking === "adaptive"
          ? ({ type: "adaptive" } as const)
          : input.thinking === "disabled"
            ? ({ type: "disabled" } as const)
            : undefined;

      const conversation = query({
        prompt: buildPromptArg(input.prompt, input.resume, input.images),
        options: {
          model: "claude-sonnet-4-6",
          executable: "bun",
          permissionMode: effectivePermMode,
          allowDangerouslySkipPermissions: needsDangerous,
          env: { ...cleanEnv, ...projectEnv },
          abortController: ac,
          stderr: (data: string) => {
            console.error("[chat] stderr:", data);
          },
          ...(thinkingConfig ? { thinking: thinkingConfig } : {}),
          // Intercept AskUserQuestion and ExitPlanMode to pause for user input
          canUseTool: async (
            toolName: string,
            toolInput: unknown,
            opts: { toolUseID: string }
          ) => {
            if (toolName === "AskUserQuestion" && sessionId) {
              const typedInput = (toolInput as Record<string, unknown>) ?? {};
              // Check for pre-filled answers stored during a restart scenario
              const stored = getPendingQuestion(opts.toolUseID);
              if (stored?.prefilledAnswers) {
                deletePendingQuestion(opts.toolUseID);
                return {
                  behavior: "allow" as const,
                  updatedInput: {
                    ...typedInput,
                    answers: stored.prefilledAnswers,
                  },
                };
              }
              // Normal flow: persist to DB then pause for user input
              upsertPendingQuestion(opts.toolUseID, sessionId!, typedInput);
              return new Promise<
                | { behavior: "allow"; updatedInput?: Record<string, unknown> }
                | { behavior: "deny"; message: string }
              >((resolve) => {
                pendingAnswers.set(opts.toolUseID, {
                  resolve,
                  sessionId: sessionId!,
                  toolInput: typedInput,
                });
              });
            }

            if (toolName === "ExitPlanMode" && sessionId) {
              const typedInput = (toolInput as Record<string, unknown>) ?? {};
              const allowedPrompts = (typedInput.allowedPrompts ??
                []) as Array<{
                tool: string;
                prompt: string;
              }>;
              // Try to read the plan file. Claude writes plan files to
              // ~/.claude/plans/<name>.md, NOT to cwd/PLAN.md.
              // Strategy:
              //   1. Check if typedInput contains a plan file path directly.
              //   2. Scan ~/.claude/plans/ for the most recently modified .md
              //      file (written within the last 60 s, i.e. just now).
              //   3. Fall back to cwd/PLAN.md for legacy compatibility.
              let planText = "";
              {
                const {
                  readFile,
                  readdir,
                  stat: fsStat,
                } = await import("node:fs/promises");
                const homedir = (await import("node:os")).homedir();
                const plansDir = join(homedir, ".claude", "plans");

                // 1. Explicit path in tool input
                const explicitPath =
                  (typedInput.planFilePath as string | undefined) ??
                  (typedInput.plan_file_path as string | undefined);
                if (explicitPath) {
                  planText = await readFile(explicitPath, "utf-8").catch(
                    () => ""
                  );
                }

                // 2. Most recently modified plan file (written ≤ 60 s ago)
                if (!planText) {
                  try {
                    const now = Date.now();
                    const files = await readdir(plansDir);
                    const mdFiles = files.filter((f) => f.endsWith(".md"));
                    const stats = await Promise.all(
                      mdFiles.map(async (f) => ({
                        name: f,
                        mtimeMs: (await fsStat(join(plansDir, f))).mtimeMs,
                      }))
                    );
                    // Sort newest first
                    stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
                    const recent = stats.find((s) => now - s.mtimeMs < 60_000);
                    if (recent) {
                      planText = await readFile(
                        join(plansDir, recent.name),
                        "utf-8"
                      ).catch(() => "");
                    }
                  } catch {
                    // ~/.claude/plans/ may not exist — that's fine
                  }
                }

                // 3. Legacy cwd/PLAN.md fallback
                if (!planText && input.cwd) {
                  planText = await readFile(
                    join(input.cwd, "PLAN.md"),
                    "utf-8"
                  ).catch(() => "");
                }
              }
              return new Promise<
                | { behavior: "allow"; updatedInput?: Record<string, unknown> }
                | { behavior: "deny"; message: string }
              >((resolve) => {
                pendingExitPlanMode.set(opts.toolUseID, {
                  resolve,
                  sessionId: sessionId!,
                  planText,
                  allowedPrompts,
                  toolInput: typedInput,
                });
              });
            }

            return { behavior: "allow" as const };
          },
          mcpServers: {
            [process.env.INSTANCE_NAME ?? "claude-explorer"]: {
              command: "bun",
              args: [explorerServerPath],
              env: {
                EXPLORER_BASE_URL: baseUrl,
                EXPLORER_RPC_URL: `${baseUrl}/rpc`,
                ...(process.env.RPC_INTERNAL_TOKEN
                  ? { RPC_INTERNAL_TOKEN: process.env.RPC_INTERNAL_TOKEN }
                  : {}),
              },
            },
          },
          hooks: createSessionHooks("chat"),
          ...(input.resume ? { resume: input.resume } : {}),
          ...(input.cwd ? { cwd: input.cwd } : {}),
        },
      });

      // Use a multiplexed loop so we can emit periodic heartbeat events while
      // the SDK is blocked on canUseTool (e.g. waiting for AskUserQuestion).
      // Without heartbeats the SSE connection can be killed by proxies/browsers
      // after ~60s of silence, causing the pending question to be silently lost.
      const HEARTBEAT_MS = 20_000;
      const sdkIter = conversation[Symbol.asyncIterator]();
      let pendingNext: Promise<IteratorResult<SDKMessage>> | null = null;

      while (true) {
        if (!pendingNext) pendingNext = sdkIter.next();

        const result = await Promise.race([
          pendingNext.then((r) => ({ source: "sdk" as const, result: r })),
          new Promise<{ source: "heartbeat" }>((resolve) =>
            setTimeout(() => resolve({ source: "heartbeat" }), HEARTBEAT_MS)
          ),
        ]);

        if (result.source === "heartbeat") {
          yield { type: "heartbeat" } as unknown as SDKMessage;
          continue;
        }

        pendingNext = null;
        if (result.result.done) break;

        const msg = result.result.value;
        // Capture session_id from init message
        if ("type" in msg && msg.type === "system" && "session_id" in msg) {
          sessionId = (msg as { session_id: string }).session_id;
          // Mark this session as having an active SSE stream.
          activeStreams.add(sessionId);
          // Explicitly set project_path — the SessionStart hook's input.cwd is
          // unreliable (undefined at runtime), so we capture it here directly.
          upsertSession(sessionId, {
            project_path: input.cwd ?? process.cwd(),
          });
        }
        // Capture result metrics
        if ("type" in msg && msg.type === "result" && sessionId) {
          const r = msg as {
            total_cost_usd?: number;
            usage?: { input_tokens?: number; output_tokens?: number };
            num_turns?: number;
            duration_ms?: number;
            is_error?: boolean;
            subtype?: string;
          };
          upsertSession(sessionId, {
            cost_usd: r.total_cost_usd ?? null,
            input_tokens: r.usage?.input_tokens ?? null,
            output_tokens: r.usage?.output_tokens ?? null,
            num_turns: r.num_turns ?? null,
            duration_ms: r.duration_ms ?? null,
            ...(r.is_error
              ? { state: "error", error: r.subtype ?? "error" }
              : {}),
          });
        }
        yield msg;
      }
    } catch (err) {
      if (signal?.aborted) return;
      console.error("[chat] error:", err);
      throw err;
    } finally {
      if (sessionId) cleanupPendingAnswers(sessionId);
    }
  });

// Procedure for answering a pending AskUserQuestion tool call
const answerQuestionProc = os
  .input(
    z.object({
      sessionId: z.string(),
      toolUseId: z.string(),
      answers: z.record(z.string(), z.array(z.string())),
    })
  )
  .output(
    z.object({ success: z.boolean(), needsResume: z.boolean().optional() })
  )
  .handler(async ({ input }) => {
    const pending = pendingAnswers.get(input.toolUseId);

    // Helper: convert { [header]: string[] } → { [questionText]: string }
    function convertAnswers(
      toolInput: Record<string, unknown>
    ): Record<string, string> {
      const questions = (toolInput.questions ?? []) as Array<{
        question: string;
        header: string;
      }>;
      const headerToQuestion: Record<string, string> = {};
      for (const q of questions) {
        headerToQuestion[q.header] = q.question;
      }
      const converted: Record<string, string> = {};
      for (const [header, labelArray] of Object.entries(input.answers)) {
        const questionText = headerToQuestion[header] ?? header;
        converted[questionText] = labelArray.join(", ");
      }
      return converted;
    }

    if (pending) {
      // Fast path — server is still running, in-memory promise is live.
      // But first check: is the SSE stream still alive? If the stream died
      // (e.g. network timeout, browser tab backgrounded), cleanupPendingAnswers
      // already resolved the promise with "deny" and removed it from activeStreams.
      // In that case, fall through to the slow path so we return needsResume: true.
      if (activeStreams.has(input.sessionId)) {
        const convertedAnswers = convertAnswers(pending.toolInput);
        pending.resolve({
          behavior: "allow",
          updatedInput: {
            ...pending.toolInput,
            answers: convertedAnswers,
          },
        });
        pendingAnswers.delete(input.toolUseId);
        deletePendingQuestion(input.toolUseId);
        return { success: true };
      }
      // Stream is dead — the promise was already denied by cleanupPendingAnswers.
      // Fall through to the slow path to use the DB row.
      pendingAnswers.delete(input.toolUseId);
    }

    // Slow path — server was restarted or SSE stream died. Promise is gone but
    // the DB row still exists (we intentionally kept it in cleanupPendingAnswers).
    const stored = getPendingQuestion(input.toolUseId);
    if (!stored) return { success: false };

    // Persist pre-filled answers so canUseTool can auto-resolve on resume.
    const convertedAnswers = convertAnswers(stored.toolInput);
    setPrefilledAnswers(input.toolUseId, convertedAnswers);

    // Signal the frontend to trigger a session resume stream.
    return { success: false, needsResume: true };
  });

// Procedure for approving or rejecting a pending ExitPlanMode tool call
const approvePlanProc = os
  .input(
    z.object({
      sessionId: z.string(),
      toolUseId: z.string(),
      /** true = approve, false = reject */
      approved: z.boolean(),
      /** Optional feedback message when rejecting */
      feedback: z.string().optional(),
    })
  )
  .output(
    z.object({ success: z.boolean(), needsResume: z.boolean().optional() })
  )
  .handler(async ({ input }) => {
    const pending = pendingExitPlanMode.get(input.toolUseId);

    if (pending) {
      // Check if the SSE stream is still alive before resolving. If the stream
      // died (network blip, tab suspended, etc.), cleanupPendingAnswers already
      // resolved the promise with "deny" and removed the session from activeStreams.
      // In that case fall through to return needsResume: true so the frontend
      // reopens the stream.
      if (activeStreams.has(input.sessionId)) {
        if (input.approved) {
          pending.resolve({
            behavior: "allow" as const,
            updatedInput: pending.toolInput,
          });
        } else {
          pending.resolve({
            behavior: "deny" as const,
            message:
              input.feedback?.trim() ||
              "User rejected the plan. Please revise and try again.",
          });
        }
        pendingExitPlanMode.delete(input.toolUseId);
        return { success: true };
      }
      // Stream is dead — the promise was already denied by cleanupPendingAnswers.
      pendingExitPlanMode.delete(input.toolUseId);
    }

    // No in-memory entry (server restarted or stream died). Signal the frontend
    // to trigger a session resume so the agent can re-ask for plan approval.
    return { success: false, needsResume: true };
  });

// Procedure to fetch the current pending plan (for restoring UI state)
const getPendingPlanProc = os
  .input(z.object({ sessionId: z.string(), toolUseId: z.string() }))
  .output(
    z
      .object({
        planText: z.string(),
        allowedPrompts: z.array(
          z.object({ tool: z.string(), prompt: z.string() })
        ),
      })
      .nullable()
  )
  .handler(async ({ input }) => {
    const pending = pendingExitPlanMode.get(input.toolUseId);
    if (!pending || pending.sessionId !== input.sessionId) return null;
    return {
      planText: pending.planText,
      allowedPrompts: pending.allowedPrompts,
    };
  });

// --- Webhooks ---

const listWebhooksProc = os
  .output(z.array(WebhookConfigSchema))
  .handler(async () => getWebhooks());

const createWebhookProc = os
  .input(
    z.object({
      name: z.string(),
      provider: z.enum(["linear", "github", "generic", "railway"]),
      projectSlug: z.string().optional(),
      sessionId: z.string().optional(),
      prompt: z.string(),
      signingSecret: z.string().optional(),
      integrationId: z.string().optional(),
      subscribedEvents: z.array(z.string()).optional(),
    })
  )
  .output(WebhookConfigSchema)
  .handler(async ({ input }) => {
    const webhook = {
      id: crypto.randomUUID(),
      name: input.name,
      provider: input.provider,
      projectSlug: input.projectSlug,
      sessionId: input.sessionId,
      prompt: input.prompt,
      signingSecret: input.signingSecret,
      enabled: true,
      createdAt: new Date().toISOString(),
      triggerCount: 0,
      integrationId: input.integrationId,
      subscribedEvents: input.subscribedEvents,
    };
    return addWebhook(webhook);
  });

const deleteWebhookProc = os
  .input(z.object({ id: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => ({ success: await removeWebhook(input.id) }));

const toggleWebhookProc = os
  .input(z.object({ id: z.string() }))
  .output(WebhookConfigSchema.nullable())
  .handler(async ({ input }) => toggleWebhook(input.id));

const listWebhookEventsProc = os
  .input(z.object({ webhookId: z.string().optional() }))
  .output(z.array(WebhookEventSchema))
  .handler(async ({ input }) => getWebhookEvents(input.webhookId));

// --- Cron Events ---

const listCronEventsProc = os
  .input(z.object({ cronId: z.string().optional() }))
  .output(z.array(CronEventSchema))
  .handler(async ({ input }) => getCronEvents(input.cronId));

const createDirProc = os
  .input(
    z.object({
      slug: z.string(),
      subpath: z.string().optional(),
      name: z.string(),
    })
  )
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    await createDirectory(projectPath, input.subpath, input.name);
    return { success: true };
  });

const createProjectProc = os
  .input(
    z.object({
      parentDir: z.string(),
      name: z.string(),
      initialPrompt: z.string().optional(),
      mcps: z.array(z.string()).optional(),
      skills: z.array(z.string()).optional(),
    })
  )
  .output(
    z.object({
      slug: z.string(),
      path: z.string(),
    })
  )
  .handler(async ({ input }) => {
    const parentStat = await stat(input.parentDir).catch(() => null);
    if (!parentStat?.isDirectory()) {
      throw new Error(`Parent directory does not exist: ${input.parentDir}`);
    }

    const projectPath = await createProjectDirectory(
      input.parentDir,
      input.name
    );
    // Let the Claude CLI register this project in ~/.claude.json by running
    // a benign mcp add+remove pair.  The CLI writes the project entry as a
    // side-effect of any `claude mcp` mutation, which ensures slug resolution
    // works correctly for all project names (including those with hyphens).
    await runClaudeCli(
      ["mcp", "add", "__init__", "--", "echo", "init"],
      projectPath
    );
    await runClaudeCli(["mcp", "remove", "__init__"], projectPath);
    invalidateSlugCache();

    // Install selected MCPs
    if (input.mcps?.length) {
      for (const mcpId of input.mcps) {
        const entry = MCP_CATALOG.find((m) => m.id === mcpId);
        if (entry?.command && entry.args) {
          try {
            await runClaudeCli(
              ["mcp", "add", mcpId, "--", entry.command, ...entry.args],
              projectPath
            );
          } catch {
            // Non-fatal — continue with other MCPs
          }
        }
      }
    }

    // Install selected skills
    if (input.skills?.length) {
      for (const skillId of input.skills) {
        try {
          await runClaudeCli(["skills", "add", skillId], projectPath);
        } catch {
          // Non-fatal
        }
      }
    }

    invalidateSlugCache();
    const slug = await resolveSlugForCwd(projectPath);
    return { slug, path: projectPath };
  });

const listDirProc = os
  .input(z.object({ slug: z.string(), subpath: z.string().optional() }))
  .output(
    z.array(
      z.object({ name: z.string(), isDirectory: z.boolean(), size: z.number() })
    )
  )
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    return listDirectory(projectPath, input.subpath);
  });

const readFileProc = os
  .input(z.object({ slug: z.string(), path: z.string() }))
  .output(z.object({ content: z.string(), size: z.number() }))
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    return readFileContent(projectPath, input.path);
  });

const gitStatusProc = os
  .input(z.object({ slug: z.string() }))
  .output(
    z.object({
      isRepo: z.boolean(),
      branch: z.string(),
      changes: z.array(z.object({ path: z.string(), status: z.string() })),
    })
  )
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    return getGitStatus(projectPath);
  });

const gitDiffProc = os
  .input(z.object({ slug: z.string(), path: z.string() }))
  .output(
    z
      .object({
        diff: z.string(),
        additions: z.number(),
        deletions: z.number(),
      })
      .nullable()
  )
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    return getGitFileDiff(projectPath, input.path);
  });

const gitOpOutput = z.object({
  success: z.boolean(),
  output: z.string(),
});

const gitPullProc = os
  .input(z.object({ slug: z.string() }))
  .output(gitOpOutput)
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    return gitPull(projectPath);
  });

const gitStageAllProc = os
  .input(z.object({ slug: z.string() }))
  .output(gitOpOutput)
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    return gitStageAll(projectPath);
  });

const gitCommitProc = os
  .input(z.object({ slug: z.string(), message: z.string() }))
  .output(gitOpOutput)
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    return gitCommit(projectPath, input.message);
  });

const gitCommitPushProc = os
  .input(z.object({ slug: z.string(), message: z.string() }))
  .output(gitOpOutput)
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    return gitCommitAndPush(projectPath, input.message);
  });

// --- Git Log / History ---

const GitLogEntrySchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  subject: z.string(),
  body: z.string(),
  author: z.string(),
  date: z.string(),
});

const GitCommitFileSchema = z.object({
  path: z.string(),
  additions: z.number(),
  deletions: z.number(),
});

const gitLogProc = os
  .input(z.object({ slug: z.string(), limit: z.number().optional() }))
  .output(z.object({ commits: z.array(GitLogEntrySchema) }))
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    const commits = await getGitLog(projectPath, input.limit ?? 20);
    return { commits };
  });

const gitCommitFilesProc = os
  .input(z.object({ slug: z.string(), hash: z.string() }))
  .output(z.object({ files: z.array(GitCommitFileSchema) }))
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    const files = await getGitCommitFiles(projectPath, input.hash);
    return { files };
  });

const gitCommitDiffProc = os
  .input(z.object({ slug: z.string(), hash: z.string(), path: z.string() }))
  .output(z.object({ diff: z.string() }))
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    const diff = await getGitCommitDiff(projectPath, input.hash, input.path);
    return { diff };
  });

const SkillInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
  scope: z.enum(["user", "project"]),
  type: z.enum(["skill", "command"]),
});

const userConfigProc = os
  .output(
    z.object({
      mcpServers: z.record(z.string(), z.unknown()),
      skills: z.array(SkillInfoSchema),
    })
  )
  .handler(async () => {
    const [mcpServers, userSkills, userCommands] = await Promise.all([
      readUserMcpServers(),
      readUserSkills(),
      readUserCommands(),
    ]);
    return { mcpServers, skills: [...userSkills, ...userCommands] };
  });

const projectConfigProc = os
  .input(z.object({ slug: z.string() }))
  .output(
    z.object({
      mcpServers: z.record(z.string(), z.unknown()).nullable(),
      localMcpServers: z.record(z.string(), z.unknown()),
      userMcpServers: z.record(z.string(), z.unknown()),
      claudeMd: z.string().nullable(),
      agents: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          model: z.string().optional(),
          tools: z.string().optional(),
        })
      ),
      skills: z.array(SkillInfoSchema),
      env: z.record(z.string(), z.string()),
    })
  )
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    const [
      mcpServers,
      localMcpServers,
      userMcpServers,
      claudeMd,
      agents,
      userSkills,
      userCommands,
      projectCommands,
      env,
    ] = await Promise.all([
      readProjectMcpConfig(projectPath),
      readLocalMcpServers(projectPath),
      readUserMcpServers(),
      readProjectClaudeMd(projectPath),
      readProjectAgents(projectPath),
      readUserSkills(),
      readUserCommands(),
      readProjectCommands(projectPath),
      readProjectEnv(projectPath),
    ]);
    const skills = [...projectCommands, ...userSkills, ...userCommands];
    return {
      mcpServers,
      localMcpServers,
      userMcpServers,
      claudeMd,
      agents,
      skills,
      env,
    };
  });

// --- Analytics ---

const globalStatsProc = os
  .output(GlobalStatsSchema)
  .handler(async () => readGlobalStats());

const activityProc = os
  .output(z.array(DailyActivitySchema))
  .handler(async () => readStatsCache());

const facetsProc = os
  .input(z.object({ sessionIds: z.array(z.string()) }))
  .output(z.array(SessionFacetSchema))
  .handler(async ({ input }) => readSessionFacets(input.sessionIds));

// --- Integrations ---

const listIntegrationsProc = os
  .output(z.array(IntegrationConfigSchema.omit({ auth: true })))
  .handler(async () => {
    const all = await getIntegrations();
    return all.map(({ auth: _auth, ...rest }) => rest);
  });

const createIntegrationProc = os
  .input(
    z.object({
      type: z.enum(["linear", "railway", "github"]),
      name: z.string(),
      projectSlug: z.string().optional(),
      token: z.string().optional(),
      apiKeyId: z.string().optional(),
      config: z.record(z.string(), z.unknown()).optional(),
    })
  )
  .output(IntegrationConfigSchema.omit({ auth: true }))
  .handler(async ({ input }) => {
    let token = input.token ?? "";
    if (input.apiKeyId) {
      const vaultKey = await getApiKey(input.apiKeyId);
      if (vaultKey) token = vaultKey.token;
    }
    const integration = {
      id: crypto.randomUUID(),
      type: input.type,
      name: input.name,
      projectSlug: input.projectSlug,
      enabled: true,
      createdAt: new Date().toISOString(),
      auth: { token },
      apiKeyId: input.apiKeyId,
      config: input.config,
    };
    const saved = await addIntegration(integration);
    const { auth: _auth, ...rest } = saved;
    return rest;
  });

const deleteIntegrationProc = os
  .input(z.object({ id: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => ({
    success: await removeIntegration(input.id),
  }));

const toggleIntegrationProc = os
  .input(z.object({ id: z.string() }))
  .output(IntegrationConfigSchema.omit({ auth: true }).nullable())
  .handler(async ({ input }) => {
    const result = await toggleIntegration(input.id);
    if (!result) return null;
    const { auth: _auth, ...rest } = result;
    return rest;
  });

const integrationDataProc = os
  .input(z.object({ id: z.string() }))
  .output(
    z.object({
      widgets: z.array(IntegrationWidgetSchema),
      error: z.string().optional(),
    })
  )
  .handler(async ({ input }) => {
    const all = await getIntegrations();
    const integration = all.find((i) => i.id === input.id);
    if (!integration) return { widgets: [], error: "Integration not found" };
    if (!integration.enabled)
      return { widgets: [], error: "Integration disabled" };

    const provider = getProvider(integration.type);
    if (!provider)
      return { widgets: [], error: `Unknown provider: ${integration.type}` };

    // Check cache first
    const cached = getCachedWidgets(integration.id);
    if (cached) return { widgets: cached };

    try {
      const token = await resolveIntegrationToken(integration);
      const resolved = { ...integration, auth: { token } };
      const widgets = await provider.fetchWidgets(resolved);
      setCachedWidgets(integration.id, widgets);
      await updateIntegrationError(integration.id, null);
      return { widgets };
    } catch (e) {
      const error = e instanceof Error ? e.message : "Fetch failed";
      await updateIntegrationError(integration.id, error);
      // Return stale cache if available
      const stale = getStaleCachedWidgets(integration.id);
      return { widgets: stale ?? [], error };
    }
  });

const testIntegrationProc = os
  .input(
    z.object({
      type: z.enum(["linear", "railway", "github"]),
      token: z.string(),
      config: z.record(z.string(), z.unknown()).optional(),
    })
  )
  .output(
    z.object({
      ok: z.boolean(),
      error: z.string().optional(),
      meta: z
        .object({
          userName: z.string().optional(),
          teams: z
            .array(z.object({ id: z.string(), name: z.string() }))
            .optional(),
          projects: z
            .array(z.object({ id: z.string(), name: z.string() }))
            .optional(),
        })
        .optional(),
    })
  )
  .handler(async ({ input }) => {
    const provider = getProvider(input.type);
    if (!provider)
      return { ok: false, error: `Unknown provider: ${input.type}` };
    return provider.testConnection(input.token, input.config);
  });

const suggestIntegrationsProc = os
  .input(z.object({ slug: z.string() }))
  .output(
    z.array(
      z.object({
        type: z.enum(["linear", "railway", "github"]),
        reason: z.string(),
        alreadyConfigured: z.boolean(),
      })
    )
  )
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    const [
      mcpServers,
      localMcpServers,
      userMcpServers,
      integrations,
      projects,
    ] = await Promise.all([
      readProjectMcpConfig(projectPath),
      readLocalMcpServers(projectPath),
      readUserMcpServers(),
      getIntegrations(),
      listProjects(),
    ]);

    const allServerNames = [
      ...Object.keys(mcpServers ?? {}),
      ...Object.keys(localMcpServers),
      ...Object.keys(userMcpServers),
    ].map((n) => n.toLowerCase());

    const configured = new Set(
      integrations
        .filter((i) => !input.slug || i.projectSlug === input.slug)
        .map((i) => i.type)
    );

    const suggestions: {
      type: "linear" | "railway" | "github";
      reason: string;
      alreadyConfigured: boolean;
    }[] = [];

    if (allServerNames.some((n) => n.includes("linear"))) {
      suggestions.push({
        type: "linear",
        reason: "Linear MCP server detected",
        alreadyConfigured: configured.has("linear"),
      });
    }
    if (allServerNames.some((n) => n.includes("railway"))) {
      suggestions.push({
        type: "railway",
        reason: "Railway MCP server detected",
        alreadyConfigured: configured.has("railway"),
      });
    }

    const project = projects.find((p) => p.slug === input.slug);
    if (project?.gitRemoteUrl?.includes("github.com")) {
      suggestions.push({
        type: "github",
        reason: "GitHub repo detected",
        alreadyConfigured: configured.has("github"),
      });
    }

    return suggestions;
  });

// --- Root Workspace ---

const rootPrimarySessionProc = os
  .output(z.object({ sessionId: z.string().nullable() }))
  .handler(async () => ({
    sessionId: await getRootPrimarySessionId(),
  }));

const rootSetPrimaryProc = os
  .input(z.object({ sessionId: z.string().nullable() }))
  .handler(async ({ input }) => {
    await setRootPrimarySessionId(input.sessionId);
  });

const rootSessionsProc = os
  .input(z.object({ limit: z.number().optional() }))
  .output(z.array(SessionMetaSchema))
  .handler(async ({ input }) => {
    const rows = getDbProjectSessions(USER_HOME, input.limit ?? 20);
    return rows.map(sessionRowToMeta);
  });

const rootSessionMessagesProc = os
  .input(z.object({ sessionId: z.string() }))
  .output(z.array(ParsedMessageSchema))
  .handler(async ({ input }) => {
    const slug = await resolveSlugForCwd(USER_HOME);
    return getSessionMessages(slug, input.sessionId);
  });

const rootChatProc = os
  .input(
    z.object({
      prompt: z.string(),
      resume: z.string().optional(),
      images: z.array(ImageInputSchema).optional(),
      thinking: z.enum(["adaptive", "disabled"]).optional(),
      permissionMode: z
        .enum([
          "bypassPermissions",
          "default",
          "acceptEdits",
          "plan",
          "dontAsk",
        ])
        .optional(),
    })
  )
  .output(eventIterator(z.custom<SDKMessage>()))
  .handler(async function* ({ input, signal }) {
    const explorerServerPath = join(
      process.cwd(),
      "tools",
      "explorer-server.ts"
    );
    const baseUrl =
      process.env.EXPLORER_BASE_URL ??
      `http://localhost:${process.env.PORT ?? 3000}`;

    const ac = new AbortController();
    signal?.addEventListener("abort", () => ac.abort(), { once: true });

    let sessionId: string | undefined;

    signal?.addEventListener(
      "abort",
      () => {
        if (sessionId) cleanupPendingAnswers(sessionId);
      },
      { once: true }
    );

    try {
      const effectivePermMode = input.permissionMode ?? "bypassPermissions";
      const needsDangerous = effectivePermMode === "bypassPermissions";

      const thinkingConfig =
        input.thinking === "adaptive"
          ? ({ type: "adaptive" } as const)
          : input.thinking === "disabled"
            ? ({ type: "disabled" } as const)
            : undefined;

      const conversation = query({
        prompt: buildPromptArg(input.prompt, input.resume, input.images),
        options: {
          model: "claude-sonnet-4-6",
          executable: "bun",
          permissionMode: effectivePermMode,
          allowDangerouslySkipPermissions: needsDangerous,
          env: cleanEnv,
          cwd: USER_HOME,
          abortController: ac,
          stderr: (data: string) => {
            console.error("[rootChat] stderr:", data);
          },
          ...(thinkingConfig ? { thinking: thinkingConfig } : {}),
          canUseTool: async (
            toolName: string,
            toolInput: unknown,
            opts: { toolUseID: string }
          ) => {
            if (toolName === "AskUserQuestion" && sessionId) {
              const typedInput = (toolInput as Record<string, unknown>) ?? {};
              // Check for pre-filled answers stored during a restart scenario
              const stored = getPendingQuestion(opts.toolUseID);
              if (stored?.prefilledAnswers) {
                deletePendingQuestion(opts.toolUseID);
                return {
                  behavior: "allow" as const,
                  updatedInput: {
                    ...typedInput,
                    answers: stored.prefilledAnswers,
                  },
                };
              }
              // Normal flow: persist to DB then pause for user input
              upsertPendingQuestion(opts.toolUseID, sessionId!, typedInput);
              return new Promise<
                | { behavior: "allow"; updatedInput?: Record<string, unknown> }
                | { behavior: "deny"; message: string }
              >((resolve) => {
                pendingAnswers.set(opts.toolUseID, {
                  resolve,
                  sessionId: sessionId!,
                  toolInput: typedInput,
                });
              });
            }

            if (toolName === "ExitPlanMode" && sessionId) {
              const typedInput = (toolInput as Record<string, unknown>) ?? {};
              const allowedPrompts = (typedInput.allowedPrompts ??
                []) as Array<{
                tool: string;
                prompt: string;
              }>;
              // Scan ~/.claude/plans/ for the most recently modified plan file
              let planText = "";
              {
                const {
                  readFile,
                  readdir,
                  stat: fsStat,
                } = await import("node:fs/promises");
                const homedir = (await import("node:os")).homedir();
                const plansDir = join(homedir, ".claude", "plans");

                // 1. Explicit path in tool input
                const explicitPath =
                  (typedInput.planFilePath as string | undefined) ??
                  (typedInput.plan_file_path as string | undefined);
                if (explicitPath) {
                  planText = await readFile(explicitPath, "utf-8").catch(
                    () => ""
                  );
                }

                // 2. Most recently modified plan file (written ≤ 60 s ago)
                if (!planText) {
                  try {
                    const now = Date.now();
                    const files = await readdir(plansDir);
                    const mdFiles = files.filter((f) => f.endsWith(".md"));
                    const stats = await Promise.all(
                      mdFiles.map(async (f) => ({
                        name: f,
                        mtimeMs: (await fsStat(join(plansDir, f))).mtimeMs,
                      }))
                    );
                    stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
                    const recent = stats.find((s) => now - s.mtimeMs < 60_000);
                    if (recent) {
                      planText = await readFile(
                        join(plansDir, recent.name),
                        "utf-8"
                      ).catch(() => "");
                    }
                  } catch {
                    // ~/.claude/plans/ may not exist — that's fine
                  }
                }
              }
              return new Promise<
                | { behavior: "allow"; updatedInput?: Record<string, unknown> }
                | { behavior: "deny"; message: string }
              >((resolve) => {
                pendingExitPlanMode.set(opts.toolUseID, {
                  resolve,
                  sessionId: sessionId!,
                  planText,
                  allowedPrompts,
                  toolInput: typedInput,
                });
              });
            }

            return { behavior: "allow" as const };
          },
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
            append:
              "You are the root workspace assistant for Claude Explorer. You have cross-project access via MCP tools (project_list, project_sessions, cron_create, webhook_create, etc). Use them to help manage all projects.",
          },
          mcpServers: {
            [process.env.INSTANCE_NAME ?? "claude-explorer"]: {
              command: "bun",
              args: [explorerServerPath],
              env: {
                EXPLORER_BASE_URL: baseUrl,
                EXPLORER_RPC_URL: `${baseUrl}/rpc`,
                ...(process.env.RPC_INTERNAL_TOKEN
                  ? { RPC_INTERNAL_TOKEN: process.env.RPC_INTERNAL_TOKEN }
                  : {}),
              },
            },
          },
          hooks: createSessionHooks("root_chat"),
          ...(input.resume ? { resume: input.resume } : {}),
        },
      });

      // Multiplexed loop with heartbeats — same as chatProc. Prevents SSE
      // connections from being killed by proxies during AskUserQuestion waits.
      const HEARTBEAT_MS = 20_000;
      const sdkIter = conversation[Symbol.asyncIterator]();
      let pendingNext: Promise<IteratorResult<SDKMessage>> | null = null;

      while (true) {
        if (!pendingNext) pendingNext = sdkIter.next();

        const result = await Promise.race([
          pendingNext.then((r) => ({ source: "sdk" as const, result: r })),
          new Promise<{ source: "heartbeat" }>((resolve) =>
            setTimeout(() => resolve({ source: "heartbeat" }), HEARTBEAT_MS)
          ),
        ]);

        if (result.source === "heartbeat") {
          yield { type: "heartbeat" } as unknown as SDKMessage;
          continue;
        }

        pendingNext = null;
        if (result.result.done) break;

        const msg = result.result.value;
        if ("type" in msg && msg.type === "system" && "session_id" in msg) {
          sessionId = (msg as { session_id: string }).session_id;
          // Mark this session as having an active SSE stream.
          activeStreams.add(sessionId);
          // Explicitly set project_path for root workspace sessions.
          upsertSession(sessionId, { project_path: USER_HOME });
        }
        if ("type" in msg && msg.type === "result" && sessionId) {
          const r = msg as {
            total_cost_usd?: number;
            usage?: { input_tokens?: number; output_tokens?: number };
            num_turns?: number;
            duration_ms?: number;
            is_error?: boolean;
            subtype?: string;
          };
          upsertSession(sessionId, {
            cost_usd: r.total_cost_usd ?? null,
            input_tokens: r.usage?.input_tokens ?? null,
            output_tokens: r.usage?.output_tokens ?? null,
            num_turns: r.num_turns ?? null,
            duration_ms: r.duration_ms ?? null,
            ...(r.is_error
              ? { state: "error", error: r.subtype ?? "error" }
              : {}),
          });
        }
        yield msg;
      }
    } catch (err) {
      if (signal?.aborted) return;
      console.error("[rootChat] error:", err);
      throw err;
    } finally {
      if (sessionId) cleanupPendingAnswers(sessionId);
    }
  });

// --- Integration-aware webhooks ---

const WebhookEventDefSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().optional(),
  category: z.string(),
});

const webhookEventCatalogProc = os
  .input(z.object({ provider: z.string() }))
  .output(
    z.object({
      events: z.array(WebhookEventDefSchema),
      promptTemplates: z.array(
        z.object({ label: z.string(), prompt: z.string() })
      ),
      verification: z.enum(["hmac-sha256", "none"]),
    })
  )
  .handler(async ({ input }) => {
    const catalog = getCatalog(input.provider);
    if (!catalog)
      return { events: [], promptTemplates: [], verification: "none" as const };
    return {
      events: catalog.events,
      promptTemplates: catalog.promptTemplates,
      verification: catalog.verification,
    };
  });

const webhookSetupInstructionsProc = os
  .input(z.object({ webhookId: z.string() }))
  .output(
    z.object({
      instructions: z.string(),
      dashboardUrl: z.string(),
      webhookUrl: z.string(),
    })
  )
  .handler(async ({ input }) => {
    const webhook = (await getWebhooks()).find((w) => w.id === input.webhookId);
    if (!webhook)
      return {
        instructions: "Webhook not found",
        dashboardUrl: "",
        webhookUrl: "",
      };

    const baseUrl =
      process.env.EXPLORER_BASE_URL ??
      `http://localhost:${process.env.PORT ?? 3000}`;
    const webhookUrl = `${baseUrl}/api/webhooks/${webhook.id}`;

    const catalog = getCatalog(webhook.provider);
    if (!catalog)
      return {
        instructions: `Webhook URL: ${webhookUrl}`,
        dashboardUrl: "",
        webhookUrl,
      };

    // Build setup config from integration if linked
    let owner: string | undefined;
    let repo: string | undefined;
    let railwayProjectId: string | undefined;
    let teamId: string | undefined;

    if (webhook.integrationId) {
      const integration = (await getIntegrations()).find(
        (i) => i.id === webhook.integrationId
      );
      if (integration?.config) {
        const gitUrl = integration.config.gitRemoteUrl as string | undefined;
        if (gitUrl) {
          const match = gitUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
          if (match) {
            owner = match[1];
            repo = match[2];
          }
        }
        railwayProjectId = integration.config.railwayProjectId as
          | string
          | undefined;
        teamId = integration.config.teamId as string | undefined;
      }
    }

    const setupConfig = {
      webhookUrl,
      signingSecret: webhook.signingSecret,
      owner,
      repo,
      railwayProjectId,
      teamId,
    };

    return {
      instructions: catalog.setupInstructions(setupConfig),
      dashboardUrl: catalog.dashboardUrl(setupConfig),
      webhookUrl,
    };
  });

const createWebhookForIntegrationProc = os
  .input(
    z.object({
      name: z.string(),
      integrationId: z.string(),
      subscribedEvents: z.array(z.string()),
      prompt: z.string(),
      signingSecret: z.string().optional(),
      projectSlug: z.string().optional(),
      sessionId: z.string().optional(),
    })
  )
  .output(
    z.object({
      webhook: WebhookConfigSchema,
      autoCreated: z.boolean(),
      autoCreateError: z.string().optional(),
    })
  )
  .handler(async ({ input }) => {
    // Look up integration to get provider + auth
    const integrations = await getIntegrations();
    const integration = integrations.find((i) => i.id === input.integrationId);
    if (!integration) throw new Error("Integration not found");

    const provider = integration.type;

    // Generate signing secret for providers that need it
    let signingSecret = input.signingSecret;
    if (!signingSecret && provider !== "railway") {
      signingSecret = crypto.randomUUID();
    }

    // Create webhook in store first
    const webhook = await addWebhook({
      id: crypto.randomUUID(),
      name: input.name,
      provider,
      projectSlug: input.projectSlug ?? integration.projectSlug,
      sessionId: input.sessionId,
      prompt: input.prompt,
      signingSecret,
      enabled: true,
      createdAt: new Date().toISOString(),
      triggerCount: 0,
      integrationId: input.integrationId,
      subscribedEvents: input.subscribedEvents,
    });

    const baseUrl =
      process.env.EXPLORER_BASE_URL ??
      `http://localhost:${process.env.PORT ?? 3000}`;
    const webhookUrl = `${baseUrl}/api/webhooks/${webhook.id}`;

    // Attempt auto-creation
    let autoCreated = false;
    let autoCreateError: string | undefined;
    const resolvedToken = await resolveIntegrationToken(integration);

    if (provider === "linear") {
      const result = await autoCreateLinearWebhook({
        apiKey: resolvedToken,
        webhookUrl,
        subscribedEvents: input.subscribedEvents,
        teamId: integration.config?.teamId as string | undefined,
        label: input.name,
      });
      autoCreated = result.success;
      autoCreateError = result.error;
    } else if (provider === "github") {
      // Parse owner/repo from integration config
      const gitUrl = integration.config?.gitRemoteUrl as string | undefined;
      const match = gitUrl?.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      if (match) {
        const result = await autoCreateGithubWebhook({
          token: resolvedToken,
          owner: match[1],
          repo: match[2],
          webhookUrl,
          subscribedEvents: input.subscribedEvents,
          secret: signingSecret,
        });
        autoCreated = result.success;
        autoCreateError = result.error;
      } else {
        autoCreateError = "Could not parse owner/repo from integration config";
      }
    }
    // Railway: skip auto-creation (no API)

    return { webhook, autoCreated, autoCreateError };
  });

// --- API Keys ---

const ApiKeySafeSchema = ApiKeySchema.omit({ token: true });

const TestResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  meta: z
    .object({
      userName: z.string().optional(),
      teams: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
      projects: z
        .array(z.object({ id: z.string(), name: z.string() }))
        .optional(),
    })
    .optional(),
});

const listApiKeysProc = os
  .output(z.array(ApiKeySafeSchema))
  .handler(async () => {
    const all = await getApiKeys();
    return all.map(({ token: _token, ...rest }) => rest);
  });

const createApiKeyProc = os
  .input(
    z.object({
      label: z.string(),
      provider: ApiKeyProviderSchema,
      token: z.string(),
    })
  )
  .output(ApiKeySafeSchema)
  .handler(async ({ input }) => {
    const key = {
      id: crypto.randomUUID(),
      label: input.label,
      provider: input.provider,
      token: input.token,
      createdAt: new Date().toISOString(),
    };
    const saved = await addApiKey(key);
    const { token: _token, ...rest } = saved;
    return rest;
  });

const updateApiKeyProc = os
  .input(
    z.object({
      id: z.string(),
      label: z.string().optional(),
      token: z.string().optional(),
    })
  )
  .output(ApiKeySafeSchema.nullable())
  .handler(async ({ input }) => {
    const { id, ...updates } = input;
    const result = await updateApiKey(id, updates);
    if (!result) return null;
    const { token: _token, ...rest } = result;
    return rest;
  });

const deleteApiKeyProc = os
  .input(z.object({ id: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => ({
    success: await removeApiKey(input.id),
  }));

const testApiKeyProc = os
  .input(z.object({ id: z.string() }))
  .output(TestResultSchema)
  .handler(async ({ input }) => {
    const key = await getApiKey(input.id);
    if (!key) return { ok: false, error: "Key not found" };
    if (key.provider === "anthropic" || key.provider === "other") {
      return { ok: true };
    }
    const provider = getProvider(key.provider);
    if (!provider)
      return { ok: false, error: `Unknown provider: ${key.provider}` };
    return provider.testConnection(key.token);
  });

const apiKeyUsageProc = os
  .output(z.record(z.string(), z.number()))
  .handler(async () => {
    const integrations = await getIntegrations();
    const counts: Record<string, number> = {};
    for (const i of integrations) {
      if (i.apiKeyId) counts[i.apiKeyId] = (counts[i.apiKeyId] ?? 0) + 1;
    }
    return counts;
  });

// --- Email ---

const emailGetConfigProc = os
  .input(z.object({ projectSlug: z.string() }))
  .output(WorkspaceEmailConfigSchema.nullable())
  .handler(async ({ input }) => getEmailConfigBySlug(input.projectSlug));

const emailSetConfigProc = os
  .input(
    z.object({
      projectSlug: z.string(),
      address: z.string(),
      enabled: z.boolean(),
      prompt: z.string(),
      onInbound: z.enum(["new_session", "existing_session"]),
      sessionId: z.string().optional(),
    })
  )
  .output(WorkspaceEmailConfigSchema)
  .handler(async ({ input }) =>
    setEmailConfig({
      projectSlug: input.projectSlug,
      address: input.address,
      enabled: input.enabled,
      prompt: input.prompt,
      onInbound: input.onInbound,
      sessionId: input.sessionId,
    })
  );

const emailRemoveConfigProc = os
  .input(z.object({ projectSlug: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => ({
    success: await removeEmailConfig(input.projectSlug),
  }));

const emailSendProc = os
  .input(
    z.object({
      to: z.string(),
      subject: z.string(),
      body: z.string(),
      fromAddress: z.string().optional(),
      inReplyTo: z.string().optional(),
      attachments: z
        .array(
          z.object({
            filePath: z
              .string()
              .describe("Absolute local file path of the file to attach"),
            filename: z
              .string()
              .describe("Filename as it will appear in the email"),
            contentType: z
              .string()
              .optional()
              .describe('MIME type, e.g. "image/jpeg" or "application/pdf"'),
          })
        )
        .optional()
        .describe("Files to attach to the outbound email"),
    })
  )
  .output(
    z.object({
      success: z.boolean(),
      messageId: z.string().optional(),
      error: z.string().optional(),
    })
  )
  .handler(async ({ input }) => {
    const domain = process.env.CHANNEL_EMAIL_DOMAIN ?? "your-domain.com";
    const from = input.fromAddress ?? `agent@${domain}`;

    try {
      const result = await sendEmail({
        from,
        to: input.to,
        subject: input.subject,
        body: input.body,
        inReplyTo: input.inReplyTo,
        attachments: input.attachments,
      });

      // Log outbound event
      await addEmailEvent({
        id: crypto.randomUUID(),
        projectSlug: "__outbound__",
        timestamp: new Date().toISOString(),
        direction: "outbound",
        from,
        to: input.to,
        subject: input.subject,
        status: "success",
        messageId: result.messageId,
      });

      return { success: true, messageId: result.messageId };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Send failed";

      await addEmailEvent({
        id: crypto.randomUUID(),
        projectSlug: "__outbound__",
        timestamp: new Date().toISOString(),
        direction: "outbound",
        from,
        to: input.to,
        subject: input.subject,
        status: "error",
        error,
      });

      return { success: false, error };
    }
  });

const emailEventsProc = os
  .input(z.object({ projectSlug: z.string().optional() }))
  .output(z.array(EmailEventSchema))
  .handler(async ({ input }) => getEmailEvents(input.projectSlug));

const emailListConfigsProc = os
  .output(z.array(WorkspaceEmailConfigSchema))
  .handler(async () => getEmailConfigs());

const emailDomainProc = os
  .output(z.object({ domain: z.string(), addresses: z.array(z.string()) }))
  .handler(async () => {
    const domain = process.env.CHANNEL_EMAIL_DOMAIN ?? "your-domain.com";
    const configs = await getEmailConfigs();
    const addresses = [
      ...new Set(configs.map((c) => c.address).filter(Boolean)),
    ];
    return { domain, addresses };
  });

// --- OAuth / Bot Identity ---

const oauthStatusProc = os
  .output(
    z.object({
      linear: z.object({
        configured: z.boolean(),
        source: z.enum(["env", "store", "none"]),
        botName: z.string().optional(),
      }),
    })
  )
  .handler(async () => {
    // Check env vars first
    const hasEnv =
      !!process.env.LINEAR_OAUTH_CLIENT_ID &&
      !!process.env.LINEAR_OAUTH_CLIENT_SECRET;
    if (hasEnv) {
      return { linear: { configured: true, source: "env" as const } };
    }

    // Check store
    const app = await getOAuthApp("linear");
    if (app) {
      return {
        linear: {
          configured: true,
          source: "store" as const,
          botName: app.botName,
        },
      };
    }

    return { linear: { configured: false, source: "none" as const } };
  });

const saveOAuthCredentialsProc = os
  .input(
    z.object({
      provider: z.enum(["linear"]),
      clientId: z.string(),
      clientSecret: z.string(),
    })
  )
  .output(
    z.object({
      ok: z.boolean(),
      botName: z.string().optional(),
      error: z.string().optional(),
    })
  )
  .handler(async ({ input }) => {
    // Test the credentials by exchanging for a token
    try {
      const res = await fetch("https://api.linear.app/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: input.clientId,
          client_secret: input.clientSecret,
          scope: "read,write,comments:create,issues:create",
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        return {
          ok: false,
          error: `Token exchange failed (${res.status}): ${body}`,
        };
      }

      const data = (await res.json()) as { access_token: string };

      // Use the token to get the app identity
      let botName: string | undefined;
      try {
        const { LinearClient } = await import("@linear/sdk");
        const lc = new LinearClient({ accessToken: data.access_token });
        // For app tokens, viewer returns the app's identity
        const viewer = await lc.viewer;
        botName = viewer.name;
      } catch {
        // Non-critical — name is just for display
      }

      // Save to store
      await saveOAuthApp({
        provider: input.provider,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        botName,
      });

      // Clear any cached bot token so next request uses new creds
      try {
        const { clearLinearBotTokenCache } =
          await import("./oauth/linear-client-credentials");
        clearLinearBotTokenCache();
      } catch {
        // ok
      }
      // Reset Chat SDK bot so it's recreated with new credentials
      try {
        const { resetBot } = await import("./chat/bot");
        resetBot();
      } catch {
        // ok
      }

      return { ok: true, botName };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Credential test failed",
      };
    }
  });

const removeOAuthCredentialsProc = os
  .input(z.object({ provider: z.enum(["linear"]) }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => {
    const success = await removeOAuthApp(input.provider);
    try {
      const { clearLinearBotTokenCache } =
        await import("./oauth/linear-client-credentials");
      clearLinearBotTokenCache();
    } catch {
      // ok
    }
    try {
      const { resetBot } = await import("./chat/bot");
      resetBot();
    } catch {
      // ok
    }
    return { success };
  });

// --- Linear Agent ---

const linearEmitActivityProc = os
  .input(
    z.object({
      agentSessionId: z.string(),
      type: z.enum(["thought", "action", "response", "error", "elicitation"]),
      body: z.string().optional(),
      action: z.string().optional(),
      parameter: z.string().optional(),
      result: z.string().optional(),
      ephemeral: z.boolean().optional(),
    })
  )
  .output(z.object({ success: z.boolean(), activityId: z.string().optional() }))
  .handler(async ({ input }) => {
    const { agentSessionId, type, ephemeral, ...rest } = input;
    let content: Record<string, unknown>;
    if (type === "action") {
      content = {
        action: rest.action ?? "",
        parameter: rest.parameter ?? "",
        ...(rest.result ? { result: rest.result } : {}),
      };
    } else {
      content = { body: rest.body ?? "" };
    }
    return emitActivity(agentSessionId, type, content as any, { ephemeral });
  });

const linearUpdatePlanProc = os
  .input(
    z.object({
      agentSessionId: z.string(),
      tasks: z.array(
        z.object({
          content: z.string(),
          status: z.enum(["pending", "inProgress", "completed", "canceled"]),
        })
      ),
    })
  )
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) =>
    updateSessionPlan(input.agentSessionId, input.tasks)
  );

const linearSetDelegateProc = os
  .input(z.object({ issueId: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => setDelegate(input.issueId));

const linearMoveToStartedProc = os
  .input(z.object({ issueId: z.string(), teamId: z.string() }))
  .output(z.object({ success: z.boolean(), stateName: z.string().optional() }))
  .handler(async ({ input }) => moveToStarted(input.issueId, input.teamId));

const linearCreateIssueProc = os
  .input(
    z.object({
      title: z.string(),
      teamId: z.string(),
      description: z.string().optional(),
      assigneeId: z.string().optional(),
      priority: z.number().optional(),
      labelIds: z.array(z.string()).optional(),
      stateId: z.string().optional(),
    })
  )
  .output(
    z.object({
      success: z.boolean(),
      issueId: z.string().optional(),
      identifier: z.string().optional(),
      url: z.string().optional(),
    })
  )
  .handler(async ({ input }) => linearCreateIssue(input));

const linearUpdateIssueProc = os
  .input(
    z.object({
      issueId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      stateId: z.string().optional(),
      assigneeId: z.string().optional(),
      priority: z.number().optional(),
      labelIds: z.array(z.string()).optional(),
      delegateId: z.string().optional(),
    })
  )
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => {
    const { issueId, ...fields } = input;
    return linearUpdateIssue(issueId, fields);
  });

const linearAddCommentProc = os
  .input(z.object({ issueId: z.string(), body: z.string() }))
  .output(z.object({ success: z.boolean(), commentId: z.string().optional() }))
  .handler(async ({ input }) => linearAddComment(input.issueId, input.body));

const linearListMyIssuesProc = os
  .input(z.object({ teamId: z.string().optional() }))
  .output(
    z.array(
      z.object({
        id: z.string(),
        identifier: z.string(),
        title: z.string(),
        url: z.string(),
        state: z.string(),
        priority: z.number(),
      })
    )
  )
  .handler(async ({ input }) => listAssignedIssues(input.teamId));

const linearCreateSessionProc = os
  .input(z.object({ issueId: z.string() }))
  .output(z.object({ success: z.boolean(), sessionId: z.string().optional() }))
  .handler(async ({ input }) => createSessionOnIssue(input.issueId));

// --- MCP Servers ---

const McpToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.unknown().optional(),
});

const addMcpServerProc = os
  .input(
    z.object({
      name: z.string(),
      scope: z.enum(["user", "local", "project"]),
      transport: z.enum(["stdio", "http", "sse"]),
      command: z.string().optional(),
      args: z.array(z.string()).optional(),
      url: z.string().optional(),
      env: z.record(z.string(), z.string()).optional(),
      slug: z.string().optional(),
    })
  )
  .output(z.object({ success: z.boolean(), error: z.string().optional() }))
  .handler(async ({ input }) => {
    const cliArgs: string[] = ["mcp", "add", "--scope", input.scope];

    if (input.env && Object.keys(input.env).length > 0) {
      // Use add-json for env vars since CLI doesn't support env via flags easily
      const jsonConfig: Record<string, unknown> = { type: input.transport };
      if (input.transport === "stdio") {
        jsonConfig.command = input.command;
        jsonConfig.args = input.args ?? [];
      } else {
        jsonConfig.url = input.url;
      }
      jsonConfig.env = input.env;

      const addJsonArgs = [
        "mcp",
        "add-json",
        "--scope",
        input.scope,
        input.name,
        JSON.stringify(jsonConfig),
      ];

      let cwd: string | undefined;
      if (input.scope !== "user" && input.slug) {
        cwd = await resolveSlugToPath(input.slug);
      }
      return runClaudeCli(addJsonArgs, cwd);
    }

    cliArgs.push("--transport", input.transport);
    cliArgs.push(input.name);

    if (input.transport === "stdio") {
      cliArgs.push("--", input.command ?? "");
      if (input.args?.length) cliArgs.push(...input.args);
    } else {
      cliArgs.push(input.url ?? "");
    }

    let cwd: string | undefined;
    if (input.scope !== "user" && input.slug) {
      cwd = await resolveSlugToPath(input.slug);
    }

    return runClaudeCli(cliArgs, cwd);
  });

const removeMcpServerProc = os
  .input(
    z.object({
      name: z.string(),
      scope: z.enum(["user", "local", "project"]),
      slug: z.string().optional(),
    })
  )
  .output(z.object({ success: z.boolean(), error: z.string().optional() }))
  .handler(async ({ input }) => {
    if (input.name === (process.env.INSTANCE_NAME ?? "claude-explorer")) {
      return { success: false, error: "Cannot remove the system MCP server" };
    }
    let cwd: string | undefined;
    if (input.scope !== "user" && input.slug) {
      cwd = await resolveSlugToPath(input.slug);
    }
    return runClaudeCli(
      ["mcp", "remove", "--scope", input.scope, input.name],
      cwd
    );
  });

const inspectToolsProc = os
  .input(
    z.object({
      name: z.string(),
      scope: z.enum(["user", "local", "project"]),
      slug: z.string().optional(),
    })
  )
  .output(
    z.object({ tools: z.array(McpToolSchema), error: z.string().optional() })
  )
  .handler(async ({ input }) => {
    try {
      let servers: Record<string, Record<string, unknown>> = {};
      if (input.scope === "user") {
        servers = (await readUserMcpServers()) as Record<
          string,
          Record<string, unknown>
        >;
      } else if (input.scope === "project" && input.slug) {
        const projectPath = await resolveSlugToPath(input.slug);
        servers = ((await readProjectMcpConfig(projectPath)) ?? {}) as Record<
          string,
          Record<string, unknown>
        >;
      } else if (input.scope === "local" && input.slug) {
        const projectPath = await resolveSlugToPath(input.slug);
        servers = (await readLocalMcpServers(projectPath)) as Record<
          string,
          Record<string, unknown>
        >;
      }

      const cfg = servers[input.name];
      if (!cfg)
        return {
          tools: [],
          error: `Server "${input.name}" not found in ${input.scope} config`,
        };

      const tools = await inspectMcpTools({
        type: (cfg.type as string) ?? "stdio",
        command: cfg.command as string | undefined,
        args: cfg.args as string[] | undefined,
        url: cfg.url as string | undefined,
        env: cfg.env as Record<string, string> | undefined,
      });

      return { tools };
    } catch (e) {
      return {
        tools: [],
        error: e instanceof Error ? e.message : "Inspection failed",
      };
    }
  });

// --- Project Environment Variables ---

const getProjectEnvProc = os
  .input(z.object({ slug: z.string() }))
  .output(z.record(z.string(), z.string()))
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    return readProjectEnv(projectPath);
  });

const setProjectEnvProc = os
  .input(z.object({ slug: z.string(), env: z.record(z.string(), z.string()) }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    await writeProjectEnv(projectPath, input.env);
    return { success: true };
  });

// --- Skills & Commands management ---

const addSkillProc = os
  .input(z.object({ name: z.string(), content: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => {
    await writeUserSkill(input.name, input.content);
    return { success: true };
  });

const removeSkillProc = os
  .input(z.object({ name: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => ({
    success: await removeUserSkill(input.name),
  }));

const addCommandProc = os
  .input(
    z.object({
      name: z.string(),
      content: z.string(),
      scope: z.enum(["user", "project"]),
      slug: z.string().optional(),
    })
  )
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => {
    if (input.scope === "project" && input.slug) {
      const projectPath = await resolveSlugToPath(input.slug);
      await writeProjectCommand(projectPath, input.name, input.content);
    } else {
      await writeUserCommand(input.name, input.content);
    }
    return { success: true };
  });

const removeCommandProc = os
  .input(
    z.object({
      name: z.string(),
      scope: z.enum(["user", "project"]),
      slug: z.string().optional(),
    })
  )
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => {
    if (input.scope === "project" && input.slug) {
      const projectPath = await resolveSlugToPath(input.slug);
      return { success: await removeProjectCommand(projectPath, input.name) };
    }
    return { success: await removeUserCommand(input.name) };
  });

const getContentProc = os
  .input(
    z.object({
      name: z.string(),
      type: z.enum(["skill", "command"]),
      scope: z.enum(["user", "project"]),
      slug: z.string().optional(),
    })
  )
  .output(z.object({ content: z.string().nullable() }))
  .handler(async ({ input }) => {
    if (input.type === "skill") {
      return { content: await readSkillContent(input.name) };
    }
    const projectPath = input.slug
      ? await resolveSlugToPath(input.slug)
      : undefined;
    return {
      content: await readCommandContent(input.scope, input.name, projectPath),
    };
  });

const installCatalogSkillProc = os
  .input(z.object({ installCommand: z.string() }))
  .output(z.object({ success: z.boolean(), error: z.string().optional() }))
  .handler(async ({ input }) => {
    try {
      const proc = Bun.spawn(
        [
          "npx",
          "-y",
          "skills",
          "add",
          ...input.installCommand.split(" "),
          "-y",
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, PATH: process.env.PATH },
        }
      );
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        return { success: false, error: stderr || `Exit code ${exitCode}` };
      }
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Failed to install skill",
      };
    }
  });

const SkillsShSkillSchema = z.object({
  id: z.string(),
  skillId: z.string(),
  name: z.string(),
  installs: z.number(),
  source: z.string(),
});

const skillsCatalogProc = os
  .input(
    z.object({ search: z.string().optional(), limit: z.number().optional() })
  )
  .output(z.object({ skills: z.array(SkillsShSkillSchema), count: z.number() }))
  .handler(async ({ input }) => {
    const limit = input.limit ?? 30;

    if (!input.search) {
      const skills = SUGGESTED_SKILLS.slice(0, limit);
      return { skills, count: skills.length };
    }

    try {
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), 5000);
      const res = await fetch(
        `https://skills.sh/api/search?q=${encodeURIComponent(input.search)}&limit=${limit}`,
        { signal: ac.signal }
      );
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        skills: SkillsShSkill[];
        count: number;
      };
      return { skills: data.skills, count: data.count };
    } catch {
      // Fallback: filter curated list locally
      const q = input.search.toLowerCase();
      const filtered = SUGGESTED_SKILLS.filter(
        (s) =>
          s.name.toLowerCase().includes(q) || s.source.toLowerCase().includes(q)
      );
      return { skills: filtered.slice(0, limit), count: filtered.length };
    }
  });

// --- Live State Procs ---

const SessionRowSchema = z.object({
  session_id: z.string(),
  project_path: z.string().nullable(),
  state: z.string(),
  current_tool: z.string().nullable(),
  source: z.string().nullable(),
  model: z.string().nullable(),
  first_prompt: z.string().nullable(),
  git_branch: z.string().nullable().optional(),
  started_at: z.string(),
  updated_at: z.string(),
  ended_at: z.string().nullable(),
  cost_usd: z.number().nullable(),
  input_tokens: z.number().nullable(),
  output_tokens: z.number().nullable(),
  num_turns: z.number().nullable(),
  duration_ms: z.number().nullable(),
  error: z.string().nullable(),
  is_archived: z.number().default(0),
});

const sessionLiveStateProc = os
  .input(z.object({ sessionId: z.string() }))
  .output(SessionRowSchema.nullable())
  .handler(async ({ input }) => getDbSession(input.sessionId) ?? null);

const activeSessionsProc = os
  .output(z.array(SessionRowSchema))
  .handler(async () => getDbActiveSessions());

const projectSessionsProc = os
  .input(z.object({ projectPath: z.string(), limit: z.number().optional() }))
  .output(z.array(SessionRowSchema))
  .handler(async ({ input }) =>
    getDbProjectSessions(input.projectPath, input.limit ?? 20)
  );

export const router = {
  projects: {
    list: listProjectsProc,
    resolveSlug: resolveSlugProc,
    config: projectConfigProc,
    files: listDirProc,
    readFile: readFileProc,
    createDir: createDirProc,
    create: createProjectProc,
    gitStatus: gitStatusProc,
    gitDiff: gitDiffProc,
    gitPull: gitPullProc,
    gitStageAll: gitStageAllProc,
    gitCommit: gitCommitProc,
    gitCommitPush: gitCommitPushProc,
    gitWorktrees: gitWorktreesProc,
    gitLog: gitLogProc,
    gitCommitFiles: gitCommitFilesProc,
    gitCommitDiff: gitCommitDiffProc,
    getEnv: getProjectEnvProc,
    setEnv: setProjectEnvProc,
  },
  user: { config: userConfigProc },
  mcpServers: {
    add: addMcpServerProc,
    remove: removeMcpServerProc,
    inspectTools: inspectToolsProc,
  },
  skills: {
    add: addSkillProc,
    remove: removeSkillProc,
    addCommand: addCommandProc,
    removeCommand: removeCommandProc,
    getContent: getContentProc,
    installFromCatalog: installCatalogSkillProc,
    catalog: skillsCatalogProc,
  },
  sessions: {
    list: listSessionsProc,
    messages: getMessagesProc,
    recent: recentSessionsProc,
    timeline: timelineSessionsProc,
    archive: archiveSessionProc,
    preview: sessionPreviewProc,
  },
  favorites: {
    get: getFavoritesProc,
    toggleProject: toggleFavoriteProjectProc,
    toggleSession: toggleFavoriteSessionProc,
  },
  crons: {
    list: listCronsProc,
    create: createCronProc,
    delete: deleteCronProc,
    toggle: toggleCronProc,
    events: listCronEventsProc,
  },
  webhooks: {
    list: listWebhooksProc,
    create: createWebhookProc,
    delete: deleteWebhookProc,
    toggle: toggleWebhookProc,
    events: listWebhookEventsProc,
    createForIntegration: createWebhookForIntegrationProc,
    eventCatalog: webhookEventCatalogProc,
    setupInstructions: webhookSetupInstructionsProc,
  },
  integrations: {
    list: listIntegrationsProc,
    create: createIntegrationProc,
    delete: deleteIntegrationProc,
    toggle: toggleIntegrationProc,
    data: integrationDataProc,
    test: testIntegrationProc,
    suggest: suggestIntegrationsProc,
  },
  apiKeys: {
    list: listApiKeysProc,
    create: createApiKeyProc,
    update: updateApiKeyProc,
    delete: deleteApiKeyProc,
    test: testApiKeyProc,
    usage: apiKeyUsageProc,
  },
  messages: {
    send: sendMessageProc,
    list: listAgentMessagesProc,
    markRead: markReadProc,
    unreadBySession: unreadBySessionProc,
  },
  tmux: {
    panes: tmuxPanesProc,
    sessions: tmuxSessionsProc,
  },
  server: { config: serverConfigProc },
  analytics: {
    globalStats: globalStatsProc,
    activity: activityProc,
    facets: facetsProc,
  },
  chat: chatProc,
  answerQuestion: answerQuestionProc,
  approvePlan: approvePlanProc,
  getPendingPlan: getPendingPlanProc,
  root: {
    primarySession: rootPrimarySessionProc,
    setPrimary: rootSetPrimaryProc,
    sessions: rootSessionsProc,
    messages: rootSessionMessagesProc,
  },
  rootChat: rootChatProc,
  liveState: {
    session: sessionLiveStateProc,
    active: activeSessionsProc,
    project: projectSessionsProc,
  },
  email: {
    getConfig: emailGetConfigProc,
    setConfig: emailSetConfigProc,
    removeConfig: emailRemoveConfigProc,
    send: emailSendProc,
    events: emailEventsProc,
    listConfigs: emailListConfigsProc,
    domain: emailDomainProc,
  },
  oauth: {
    status: oauthStatusProc,
    saveCredentials: saveOAuthCredentialsProc,
    removeCredentials: removeOAuthCredentialsProc,
  },
  linear: {
    emitActivity: linearEmitActivityProc,
    updatePlan: linearUpdatePlanProc,
    setDelegate: linearSetDelegateProc,
    moveToStarted: linearMoveToStartedProc,
    createIssue: linearCreateIssueProc,
    updateIssue: linearUpdateIssueProc,
    addComment: linearAddCommentProc,
    listMyIssues: linearListMyIssuesProc,
    createSession: linearCreateSessionProc,
  },
};
