import { query } from "@anthropic-ai/claude-agent-sdk";
import { os, eventIterator } from "@orpc/server";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { z } from "zod";

import type { SDKMessage } from "./types";

import {
  listProjects,
  listSessions,
  getSessionMessages,
  getRecentSessions,
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
  listRootSessions,
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
} from "./claude-fs";
import { sendEmail } from "./email";
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
  getTmuxSessions,
  saveTmuxSession,
  removeTmuxSession,
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
  SavedTmuxSessionSchema,
  WorkspaceEmailConfigSchema,
  EmailEventSchema,
  OAuthAppSchema,
} from "./schemas";
import { getTmuxPanes } from "./tmux";
import { generateTmuxCommand } from "./tmux-command";
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
  .handler(async ({ input }) => listSessions(input.slug, input.limit));

const getMessagesProc = os
  .input(z.object({ slug: z.string(), sessionId: z.string() }))
  .output(z.array(ParsedMessageSchema))
  .handler(async ({ input }) =>
    getSessionMessages(input.slug, input.sessionId)
  );

const recentSessionsProc = os
  .input(z.object({ limit: z.number().optional() }))
  .output(z.array(RecentSessionSchema))
  .handler(async ({ input }) => getRecentSessions(input.limit));

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

const tmuxLaunchProc = os
  .input(
    z.object({
      sessionName: z.string(),
      projectPath: z.string(),
      panelCount: z.number(),
      layout: z.enum([
        "even-horizontal",
        "even-vertical",
        "tiled",
        "main-vertical",
      ]),
      resumeSessionIds: z.array(z.string().nullable()).optional(),
      skipPermissions: z.boolean().optional(),
      model: z.string().optional(),
      maxBudgetUsd: z.number().optional(),
      customCommands: z.array(z.string().nullable()).optional(),
    })
  )
  .output(
    z.object({
      success: z.boolean(),
      command: z.string(),
      error: z.string().optional(),
    })
  )
  .handler(async ({ input }) => {
    const command = generateTmuxCommand({ ...input, detached: true });
    try {
      await Bun.$`su bun -c ${command}`.quiet();
      await saveTmuxSession({
        ...input,
        savedAt: new Date().toISOString(),
      });
      return { success: true, command };
    } catch (e) {
      const error = e instanceof Error ? e.message : "Launch failed";
      return { success: false, command, error };
    }
  });

const tmuxSavedSessionsProc = os
  .output(z.array(SavedTmuxSessionSchema))
  .handler(async () => getTmuxSessions());

const tmuxRemoveSavedProc = os
  .input(z.object({ sessionName: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => ({
    success: await removeTmuxSession(input.sessionName),
  }));

// --- Server Config ---

const serverConfigProc = os.output(ServerConfigSchema).handler(async () => ({
  sshHost: process.env.SSH_HOST ?? null,
  homeDir: USER_HOME,
}));

// --- Chat ---

const chatProc = os
  .input(
    z.object({
      prompt: z.string(),
      resume: z.string().optional(),
      cwd: z.string().optional(),
    })
  )
  .output(eventIterator(z.custom<SDKMessage>()))
  .handler(async function* ({ input, signal }) {
    const ac = new AbortController();
    signal?.addEventListener("abort", () => ac.abort(), { once: true });

    try {
      const conversation = query({
        prompt: input.prompt,
        options: {
          model: "claude-sonnet-4-6",
          executable: "bun",
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          env: cleanEnv,
          abortController: ac,
          stderr: (data: string) => {
            console.error("[chat] stderr:", data);
          },
          ...(input.resume ? { resume: input.resume } : {}),
          ...(input.cwd ? { cwd: input.cwd } : {}),
        },
      });

      for await (const msg of conversation) {
        yield msg;
      }
    } catch (err) {
      if (signal?.aborted) return;
      console.error("[chat] error:", err);
      throw err;
    }
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
    })
  )
  .output(z.object({ slug: z.string(), path: z.string() }))
  .handler(async ({ input }) => {
    const parentStat = await stat(input.parentDir).catch(() => null);
    if (!parentStat?.isDirectory()) {
      throw new Error(`Parent directory does not exist: ${input.parentDir}`);
    }

    const projectPath = await createProjectDirectory(
      input.parentDir,
      input.name
    );
    invalidateSlugCache();

    if (input.initialPrompt) {
      try {
        const conversation = query({
          prompt: input.initialPrompt,
          options: {
            model: "claude-sonnet-4-6",
            executable: "bun",
            permissionMode: "bypassPermissions",
            allowDangerouslySkipPermissions: true,
            env: cleanEnv,
            cwd: projectPath,
          },
        });
        for await (const msg of conversation) {
          if ("type" in msg && msg.type === "assistant") break;
        }
      } catch {
        // Claude session failed — project dir still created, return slug anyway
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
    ] = await Promise.all([
      readProjectMcpConfig(projectPath),
      readLocalMcpServers(projectPath),
      readUserMcpServers(),
      readProjectClaudeMd(projectPath),
      readProjectAgents(projectPath),
      readUserSkills(),
      readUserCommands(),
      readProjectCommands(projectPath),
    ]);
    const skills = [...projectCommands, ...userSkills, ...userCommands];
    return {
      mcpServers,
      localMcpServers,
      userMcpServers,
      claudeMd,
      agents,
      skills,
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
  .handler(async ({ input }) => listRootSessions(input.limit));

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

    try {
      const conversation = query({
        prompt: input.prompt,
        options: {
          model: "claude-sonnet-4-6",
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          env: cleanEnv,
          cwd: USER_HOME,
          abortController: ac,
          stderr: (data: string) => {
            console.error("[rootChat] stderr:", data);
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
          ...(input.resume ? { resume: input.resume } : {}),
        },
      });

      for await (const msg of conversation) {
        yield msg;
      }
    } catch (err) {
      if (signal?.aborted) return;
      console.error("[rootChat] error:", err);
      throw err;
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
      const proc = Bun.spawn(["npx", "-y", "skills", "add", input.installCommand], {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, PATH: process.env.PATH },
      });
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

export const router = {
  projects: {
    list: listProjectsProc,
    resolveSlug: resolveSlugProc,
    config: projectConfigProc,
    files: listDirProc,
    readFile: readFileProc,
    createDir: createDirProc,
    create: createProjectProc,
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
  },
  sessions: {
    list: listSessionsProc,
    messages: getMessagesProc,
    recent: recentSessionsProc,
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
    launch: tmuxLaunchProc,
    savedSessions: tmuxSavedSessionsProc,
    removeSaved: tmuxRemoveSavedProc,
  },
  server: { config: serverConfigProc },
  analytics: {
    globalStats: globalStatsProc,
    activity: activityProc,
    facets: facetsProc,
  },
  chat: chatProc,
  root: {
    primarySession: rootPrimarySessionProc,
    setPrimary: rootSetPrimaryProc,
    sessions: rootSessionsProc,
    messages: rootSessionMessagesProc,
  },
  rootChat: rootChatProc,
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
