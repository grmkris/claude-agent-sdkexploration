import { query } from "@anthropic-ai/claude-agent-sdk";
import { os, eventIterator } from "@orpc/server";
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
} from "./schemas";
import { getTmuxPanes } from "./tmux";

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
      provider: z.enum(["linear", "github", "generic"]),
      projectSlug: z.string().optional(),
      sessionId: z.string().optional(),
      prompt: z.string(),
      signingSecret: z.string().optional(),
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
      token: z.string(),
      config: z.record(z.string(), z.unknown()).optional(),
    })
  )
  .output(IntegrationConfigSchema.omit({ auth: true }))
  .handler(async ({ input }) => {
    const integration = {
      id: crypto.randomUUID(),
      type: input.type,
      name: input.name,
      projectSlug: input.projectSlug,
      enabled: true,
      createdAt: new Date().toISOString(),
      auth: { token: input.token },
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
      const widgets = await provider.fetchWidgets(integration);
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

export const router = {
  projects: {
    list: listProjectsProc,
    resolveSlug: resolveSlugProc,
    config: projectConfigProc,
    files: listDirProc,
    readFile: readFileProc,
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
  messages: {
    send: sendMessageProc,
    list: listAgentMessagesProc,
    markRead: markReadProc,
    unreadBySession: unreadBySessionProc,
  },
  tmux: { panes: tmuxPanesProc },
  analytics: {
    globalStats: globalStatsProc,
    activity: activityProc,
    facets: facetsProc,
  },
  chat: chatProc,
};
