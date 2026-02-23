import { query } from "@anthropic-ai/claude-agent-sdk";
import { os, eventIterator } from "@orpc/server";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
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
} from "./claude-fs";
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
} from "./explorer-store";
import {
  getProvider,
  getCachedWidgets,
  getStaleCachedWidgets,
  setCachedWidgets,
} from "./integration-providers";
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
} from "./schemas";
import { getTmuxPanes } from "./tmux";
import {
  getCatalog,
  autoCreateLinearWebhook,
  autoCreateGithubWebhook,
} from "./webhook-event-catalog";

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

// --- Server Config ---

const serverConfigProc = os.output(ServerConfigSchema).handler(async () => ({
  sshHost: process.env.SSH_HOST ?? null,
  homeDir: homedir(),
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
  .handler(async function* ({ input }) {
    const conversation = query({
      prompt: input.prompt,
      options: {
        model: "claude-sonnet-4-6",
        executable: "bun",
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,

        ...(input.resume ? { resume: input.resume } : {}),
        ...(input.cwd ? { cwd: input.cwd } : {}),
      },
    });

    for await (const msg of conversation) {
      yield msg;
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

const ROOT_SLUG = "__root__";

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
  .handler(async ({ input }) => getSessionMessages(ROOT_SLUG, input.sessionId));

const rootChatProc = os
  .input(
    z.object({
      prompt: z.string(),
      resume: z.string().optional(),
    })
  )
  .output(eventIterator(z.custom<SDKMessage>()))
  .handler(async function* ({ input }) {
    const explorerServerPath = join(
      process.cwd(),
      "tools",
      "explorer-server.ts"
    );
    const baseUrl =
      process.env.EXPLORER_BASE_URL ??
      `http://localhost:${process.env.PORT ?? 3000}`;

    const conversation = query({
      prompt: input.prompt,
      options: {
        model: "claude-sonnet-4-6",
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        cwd: homedir(),
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append:
            "You are the root workspace assistant for Claude Explorer. You have cross-project access via MCP tools (project_list, project_sessions, cron_create, webhook_create, etc). Use them to help manage all projects.",
        },
        mcpServers: {
          "claude-explorer": {
            command: "bun",
            args: [explorerServerPath],
            env: {
              EXPLORER_BASE_URL: baseUrl,
              EXPLORER_RPC_URL: `${baseUrl}/rpc`,
            },
          },
        },
        ...(input.resume ? { resume: input.resume } : {}),
      },
    });

    for await (const msg of conversation) {
      yield msg;
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
  tmux: { panes: tmuxPanesProc },
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
};
