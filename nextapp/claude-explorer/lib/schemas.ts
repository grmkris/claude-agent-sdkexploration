import { z } from "zod";

import type { ContentBlock } from "./types";

export const ProjectSchema = z.object({
  slug: z.string(),
  path: z.string(),
  lastActive: z.string().optional(),
  gitRemoteUrl: z.string().nullable().optional(),
  // From ~/.claude.json
  lastCost: z.number().optional(),
  lastDuration: z.number().optional(),
  lastLinesAdded: z.number().optional(),
  lastLinesRemoved: z.number().optional(),
  lastTotalInputTokens: z.number().optional(),
  lastTotalOutputTokens: z.number().optional(),
  lastSessionId: z.string().optional(),
  lastModelUsage: z
    .record(
      z.string(),
      z.object({
        inputTokens: z.number(),
        outputTokens: z.number(),
        cacheReadInputTokens: z.number().optional(),
        cacheCreationInputTokens: z.number().optional(),
        costUSD: z.number(),
      })
    )
    .optional(),
});

export const SessionStateSchema = z.enum(["idle", "active", "stale", "empty"]);

export const SessionMetaSchema = z.object({
  id: z.string(),
  firstPrompt: z.string(),
  timestamp: z.string(),
  model: z.string(),
  gitBranch: z.string(),
  lastModified: z.string(),
  resumeCommand: z.string(),
  sessionState: SessionStateSchema.optional(),
});

export const ParsedMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.array(z.custom<ContentBlock>()),
  timestamp: z.string(),
  uuid: z.string(),
  model: z.string().optional(),
});

export const RecentSessionSchema = SessionMetaSchema.extend({
  projectSlug: z.string(),
  projectPath: z.string(),
  sessionState: SessionStateSchema.optional(),
});

export const FavoritesSchema = z.object({
  projects: z.array(z.string()),
  sessions: z.array(z.string()),
});

export const CronJobSchema = z.object({
  id: z.string(),
  expression: z.string(),
  prompt: z.string(),
  projectSlug: z.string(),
  projectPath: z.string().optional(),
  sessionId: z.string().optional(),
  enabled: z.boolean(),
  createdAt: z.string(),
  lastRun: z.string().optional(),
  lastRunStatus: z.enum(["success", "error", "running"]).optional(),
});

export const AgentMessageSchema = z.object({
  id: z.string(),
  from: z.object({ projectSlug: z.string(), sessionId: z.string() }),
  to: z.object({ projectSlug: z.string(), sessionId: z.string().optional() }),
  body: z.string(),
  timestamp: z.string(),
  read: z.boolean(),
});

export const ServerConfigSchema = z.object({
  sshHost: z.string().nullable(),
  homeDir: z.string(),
});

export const TmuxPaneSchema = z.object({
  session: z.string(),
  window: z.number(),
  pane: z.number(),
  pid: z.number(),
  cwd: z.string(),
  projectSlug: z.string(),
});

export const WebhookConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.enum(["linear", "github", "generic", "railway"]),
  projectSlug: z.string().optional(),
  sessionId: z.string().optional(),
  prompt: z.string(),
  signingSecret: z.string().optional(),
  enabled: z.boolean(),
  createdAt: z.string(),
  lastTriggered: z.string().optional(),
  lastStatus: z.enum(["success", "error", "running"]).optional(),
  triggerCount: z.number(),
  integrationId: z.string().optional(),
  subscribedEvents: z.array(z.string()).optional(),
});

export const WebhookEventSchema = z.object({
  id: z.string(),
  webhookId: z.string(),
  timestamp: z.string(),
  provider: z.string(),
  eventType: z.string(),
  action: z.string(),
  payloadSummary: z.string(),
  status: z.enum(["success", "error", "running"]),
  sessionId: z.string().optional(),
});

export const CronEventSchema = z.object({
  id: z.string(),
  cronId: z.string(),
  timestamp: z.string(),
  status: z.enum(["success", "error", "running"]),
  expression: z.string(),
  prompt: z.string(),
  sessionId: z.string().optional(),
  error: z.string().optional(),
});

export const ApiKeyProviderSchema = z.enum([
  "anthropic",
  "linear",
  "github",
  "railway",
  "other",
]);

export const ApiKeySchema = z.object({
  id: z.string(),
  label: z.string(),
  provider: ApiKeyProviderSchema,
  token: z.string(),
  createdAt: z.string(),
});

export const IntegrationConfigSchema = z.object({
  id: z.string(),
  type: z.enum(["linear", "railway", "github"]),
  name: z.string(),
  projectSlug: z.string().optional(),
  enabled: z.boolean(),
  createdAt: z.string(),
  auth: z.object({ token: z.string() }),
  apiKeyId: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  lastFetched: z.string().optional(),
  lastError: z.string().optional(),
});

export const WidgetItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  status: z.string().optional(),
  statusColor: z.string().optional(),
  url: z.string().optional(),
  secondaryUrl: z.string().optional(),
  secondaryLabel: z.string().optional(),
  timestamp: z.string().optional(),
  copyValue: z.string().optional(),
});

export const IntegrationWidgetSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(["list", "status"]),
  items: z.array(WidgetItemSchema),
});

export const RootWorkspaceSchema = z.object({
  primarySessionId: z.string().nullable(),
});

export const ExplorerStoreSchema = z.object({
  favorites: FavoritesSchema,
  crons: z.array(CronJobSchema),
  messages: z.array(AgentMessageSchema),
  webhooks: z.array(WebhookConfigSchema),
  webhookEvents: z.array(WebhookEventSchema),
  cronEvents: z.array(CronEventSchema),
  integrations: z.array(IntegrationConfigSchema),
  apiKeys: z.array(ApiKeySchema).optional(),
  rootWorkspace: RootWorkspaceSchema.optional(),
});

export type Project = z.infer<typeof ProjectSchema>;
export type SessionMeta = z.infer<typeof SessionMetaSchema>;
export type RecentSession = z.infer<typeof RecentSessionSchema>;
export type Favorites = z.infer<typeof FavoritesSchema>;
export type ParsedMessage = z.infer<typeof ParsedMessageSchema>;
export type CronJob = z.infer<typeof CronJobSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type TmuxPane = z.infer<typeof TmuxPaneSchema>;
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;
export type CronEvent = z.infer<typeof CronEventSchema>;
export type ExplorerStore = z.infer<typeof ExplorerStoreSchema>;
export type ApiKeyProvider = z.infer<typeof ApiKeyProviderSchema>;
export type ApiKey = z.infer<typeof ApiKeySchema>;
export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>;
export type IntegrationWidget = z.infer<typeof IntegrationWidgetSchema>;
export type WidgetItem = z.infer<typeof WidgetItemSchema>;
export type RootWorkspace = z.infer<typeof RootWorkspaceSchema>;

// --- Analytics schemas ---

export const DailyActivitySchema = z.object({
  date: z.string(),
  messageCount: z.number(),
  sessionCount: z.number(),
  toolCallCount: z.number(),
});

export const SkillUsageEntrySchema = z.object({
  name: z.string(),
  usageCount: z.number(),
  lastUsedAt: z.number(),
});

export const GlobalStatsSchema = z.object({
  numStartups: z.number(),
  firstStartTime: z.string(),
  promptQueueUseCount: z.number(),
  totalCost: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalLinesAdded: z.number(),
  totalLinesRemoved: z.number(),
  skillUsage: z.array(SkillUsageEntrySchema),
});

export const SessionFacetSchema = z.object({
  sessionId: z.string(),
  outcome: z.string().optional(),
  helpfulness: z.string().optional(),
  briefSummary: z.string().optional(),
  sessionType: z.string().optional(),
  frictionCounts: z.record(z.string(), z.number()).optional(),
});

export type SessionState = z.infer<typeof SessionStateSchema>;
export type DailyActivity = z.infer<typeof DailyActivitySchema>;
export type SkillUsageEntry = z.infer<typeof SkillUsageEntrySchema>;
export type GlobalStats = z.infer<typeof GlobalStatsSchema>;
export type SessionFacet = z.infer<typeof SessionFacetSchema>;
