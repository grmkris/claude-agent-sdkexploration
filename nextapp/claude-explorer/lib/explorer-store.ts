import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type {
  ExplorerStore,
  Favorites,
  CronJob,
  AgentMessage,
  WebhookConfig,
  WebhookEvent,
  CronEvent,
  IntegrationConfig,
  ApiKey,
  SavedTmuxSession,
  WorkspaceEmailConfig,
  EmailEvent,
  OAuthApp,
} from "./types";

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");

function getStorePath() {
  return process.env.EXPLORER_STORE_PATH ?? join(CLAUDE_DIR, "explorer.json");
}
const OLD_FAVORITES_PATH = join(CLAUDE_DIR, "explorer-favorites.json");

const EMPTY_STORE: ExplorerStore = {
  favorites: { projects: [], sessions: [] },
  crons: [],
  messages: [],
  webhooks: [],
  webhookEvents: [],
  cronEvents: [],
  integrations: [],
  apiKeys: [],
  rootWorkspace: { primarySessionId: null },
  tmuxSessions: [],
  emailConfigs: [],
  emailEvents: [],
  oauthApps: [],
};

// mtime-based cache to avoid redundant readFile + JSON.parse
let storeCache: { data: ExplorerStore; mtime: number } | null = null;

export async function readStore(): Promise<ExplorerStore> {
  const path = getStorePath();
  const fStat = await stat(path).catch(() => null);

  if (fStat && storeCache && storeCache.mtime === fStat.mtimeMs) {
    return storeCache.data;
  }

  try {
    const data = JSON.parse(await readFile(path, "utf-8")) as ExplorerStore;
    if (fStat) storeCache = { data, mtime: fStat.mtimeMs };
    return data;
  } catch {
    try {
      const old: Favorites = JSON.parse(
        await readFile(OLD_FAVORITES_PATH, "utf-8")
      );
      const store: ExplorerStore = { ...EMPTY_STORE, favorites: old };
      await writeStore(store);
      return store;
    } catch {
      return { ...EMPTY_STORE };
    }
  }
}

export async function writeStore(store: ExplorerStore): Promise<void> {
  await Bun.write(getStorePath(), JSON.stringify(store, null, 2));
  const fStat = await stat(getStorePath()).catch(() => null);
  if (fStat) storeCache = { data: store, mtime: fStat.mtimeMs };
}

// --- Favorites ---

export async function getFavorites(): Promise<Favorites> {
  const store = await readStore();
  return store.favorites;
}

export async function toggleFavoriteProject(slug: string): Promise<Favorites> {
  const store = await readStore();
  const idx = store.favorites.projects.indexOf(slug);
  if (idx >= 0) store.favorites.projects.splice(idx, 1);
  else store.favorites.projects.push(slug);
  await writeStore(store);
  return store.favorites;
}

export async function toggleFavoriteSession(id: string): Promise<Favorites> {
  const store = await readStore();
  const idx = store.favorites.sessions.indexOf(id);
  if (idx >= 0) store.favorites.sessions.splice(idx, 1);
  else store.favorites.sessions.push(id);
  await writeStore(store);
  return store.favorites;
}

// --- Crons ---

export async function getCrons(): Promise<CronJob[]> {
  const store = await readStore();
  return store.crons;
}

export async function addCron(cron: CronJob): Promise<CronJob> {
  const store = await readStore();
  store.crons.push(cron);
  await writeStore(store);
  return cron;
}

export async function removeCron(id: string): Promise<boolean> {
  const store = await readStore();
  const idx = store.crons.findIndex((c) => c.id === id);
  if (idx < 0) return false;
  store.crons.splice(idx, 1);
  await writeStore(store);
  return true;
}

export async function toggleCron(id: string): Promise<CronJob | null> {
  const store = await readStore();
  const cron = store.crons.find((c) => c.id === id);
  if (!cron) return null;
  cron.enabled = !cron.enabled;
  await writeStore(store);
  return cron;
}

export async function updateCronStatus(
  id: string,
  status: CronJob["lastRunStatus"],
  lastRun?: string
): Promise<void> {
  const store = await readStore();
  const cron = store.crons.find((c) => c.id === id);
  if (!cron) return;
  cron.lastRunStatus = status;
  if (lastRun) cron.lastRun = lastRun;
  await writeStore(store);
}

// --- Messages ---

export async function getMessages(
  projectSlug: string,
  sessionId?: string
): Promise<AgentMessage[]> {
  const store = await readStore();
  return store.messages.filter((m) => {
    if (m.to.projectSlug !== projectSlug) return false;
    if (sessionId && m.to.sessionId && m.to.sessionId !== sessionId)
      return false;
    return true;
  });
}

export async function addMessage(msg: AgentMessage): Promise<AgentMessage> {
  const store = await readStore();
  store.messages.push(msg);
  await writeStore(store);
  return msg;
}

export async function markMessageRead(
  id: string
): Promise<AgentMessage | null> {
  const store = await readStore();
  const msg = store.messages.find((m) => m.id === id);
  if (!msg) return null;
  msg.read = true;
  await writeStore(store);
  return msg;
}

export async function getUnreadBySession(
  projectSlug: string
): Promise<Record<string, number>> {
  const store = await readStore();
  const counts: Record<string, number> = {};
  for (const msg of store.messages) {
    if (msg.to.projectSlug !== projectSlug || msg.read) continue;
    const key = msg.to.sessionId ?? "__project__";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

// --- Webhooks ---

export async function getWebhooks(): Promise<WebhookConfig[]> {
  const store = await readStore();
  return store.webhooks ?? [];
}

export async function getWebhook(id: string): Promise<WebhookConfig | null> {
  const store = await readStore();
  return (store.webhooks ?? []).find((w) => w.id === id) ?? null;
}

export async function addWebhook(
  webhook: WebhookConfig
): Promise<WebhookConfig> {
  const store = await readStore();
  if (!store.webhooks) store.webhooks = [];
  store.webhooks.push(webhook);
  await writeStore(store);
  return webhook;
}

export async function removeWebhook(id: string): Promise<boolean> {
  const store = await readStore();
  if (!store.webhooks) return false;
  const idx = store.webhooks.findIndex((w) => w.id === id);
  if (idx < 0) return false;
  store.webhooks.splice(idx, 1);
  await writeStore(store);
  return true;
}

export async function toggleWebhook(id: string): Promise<WebhookConfig | null> {
  const store = await readStore();
  const webhook = (store.webhooks ?? []).find((w) => w.id === id);
  if (!webhook) return null;
  webhook.enabled = !webhook.enabled;
  await writeStore(store);
  return webhook;
}

export async function updateWebhookStatus(
  id: string,
  status: WebhookConfig["lastStatus"],
  lastTriggered?: string
): Promise<void> {
  const store = await readStore();
  const webhook = (store.webhooks ?? []).find((w) => w.id === id);
  if (!webhook) return;
  webhook.lastStatus = status;
  if (lastTriggered) webhook.lastTriggered = lastTriggered;
  await writeStore(store);
}

export async function incrementWebhookTriggerCount(id: string): Promise<void> {
  const store = await readStore();
  const webhook = (store.webhooks ?? []).find((w) => w.id === id);
  if (!webhook) return;
  webhook.triggerCount = (webhook.triggerCount ?? 0) + 1;
  await writeStore(store);
}

// --- Webhook Events ---

export async function addWebhookEvent(
  event: WebhookEvent
): Promise<WebhookEvent> {
  const store = await readStore();
  if (!store.webhookEvents) store.webhookEvents = [];
  store.webhookEvents.push(event);
  // Cap at 100 most recent
  if (store.webhookEvents.length > 100) {
    store.webhookEvents = store.webhookEvents.slice(-100);
  }
  await writeStore(store);
  return event;
}

export async function updateWebhookEventStatus(
  id: string,
  status: WebhookEvent["status"],
  sessionId?: string
): Promise<void> {
  const store = await readStore();
  const event = (store.webhookEvents ?? []).find((e) => e.id === id);
  if (!event) return;
  event.status = status;
  if (sessionId) event.sessionId = sessionId;
  await writeStore(store);
}

export async function getWebhookEvents(
  webhookId?: string
): Promise<WebhookEvent[]> {
  const store = await readStore();
  const events = store.webhookEvents ?? [];
  const filtered = webhookId
    ? events.filter((e) => e.webhookId === webhookId)
    : events;
  return filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// --- Cron Events ---

export async function addCronEvent(event: CronEvent): Promise<CronEvent> {
  const store = await readStore();
  if (!store.cronEvents) store.cronEvents = [];
  store.cronEvents.push(event);
  if (store.cronEvents.length > 100) {
    store.cronEvents = store.cronEvents.slice(-100);
  }
  await writeStore(store);
  return event;
}

export async function updateCronEventStatus(
  id: string,
  status: CronEvent["status"],
  sessionId?: string
): Promise<void> {
  const store = await readStore();
  const event = (store.cronEvents ?? []).find((e) => e.id === id);
  if (!event) return;
  event.status = status;
  if (sessionId) event.sessionId = sessionId;
  await writeStore(store);
}

export async function getCronEvents(cronId?: string): Promise<CronEvent[]> {
  const store = await readStore();
  const events = store.cronEvents ?? [];
  const filtered = cronId ? events.filter((e) => e.cronId === cronId) : events;
  return filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// --- Integrations ---

export async function getIntegrations(): Promise<IntegrationConfig[]> {
  const store = await readStore();
  return store.integrations ?? [];
}

export async function addIntegration(
  integration: IntegrationConfig
): Promise<IntegrationConfig> {
  const store = await readStore();
  if (!store.integrations) store.integrations = [];
  store.integrations.push(integration);
  await writeStore(store);
  return integration;
}

export async function removeIntegration(id: string): Promise<boolean> {
  const store = await readStore();
  if (!store.integrations) return false;
  const idx = store.integrations.findIndex((i) => i.id === id);
  if (idx < 0) return false;
  store.integrations.splice(idx, 1);
  await writeStore(store);
  return true;
}

export async function toggleIntegration(
  id: string
): Promise<IntegrationConfig | null> {
  const store = await readStore();
  const integration = (store.integrations ?? []).find((i) => i.id === id);
  if (!integration) return null;
  integration.enabled = !integration.enabled;
  await writeStore(store);
  return integration;
}

export async function updateIntegrationError(
  id: string,
  error: string | null
): Promise<void> {
  const store = await readStore();
  const integration = (store.integrations ?? []).find((i) => i.id === id);
  if (!integration) return;
  integration.lastError = error ?? undefined;
  integration.lastFetched = new Date().toISOString();
  await writeStore(store);
}

// --- API Keys ---

export async function getApiKeys(): Promise<ApiKey[]> {
  const store = await readStore();
  return store.apiKeys ?? [];
}

export async function getApiKey(id: string): Promise<ApiKey | null> {
  const store = await readStore();
  return (store.apiKeys ?? []).find((k) => k.id === id) ?? null;
}

export async function addApiKey(key: ApiKey): Promise<ApiKey> {
  const store = await readStore();
  if (!store.apiKeys) store.apiKeys = [];
  store.apiKeys.push(key);
  await writeStore(store);
  return key;
}

export async function updateApiKey(
  id: string,
  updates: { label?: string; token?: string }
): Promise<ApiKey | null> {
  const store = await readStore();
  const key = (store.apiKeys ?? []).find((k) => k.id === id);
  if (!key) return null;
  if (updates.label !== undefined) key.label = updates.label;
  if (updates.token !== undefined) key.token = updates.token;
  await writeStore(store);
  return key;
}

export async function removeApiKey(id: string): Promise<boolean> {
  const store = await readStore();
  if (!store.apiKeys) return false;
  const idx = store.apiKeys.findIndex((k) => k.id === id);
  if (idx < 0) return false;
  store.apiKeys.splice(idx, 1);
  await writeStore(store);
  return true;
}

export async function resolveIntegrationToken(
  integration: IntegrationConfig
): Promise<string> {
  // For Linear integrations, prefer bot token if OAuth is configured
  if (
    integration.type === "linear" &&
    integration.config?.useOAuth !== false
  ) {
    try {
      const { isLinearBotConfiguredAsync, getLinearBotToken } = await import(
        "./oauth/linear-client-credentials"
      );
      if (await isLinearBotConfiguredAsync()) {
        const { accessToken } = await getLinearBotToken();
        return accessToken;
      }
    } catch {
      // Fall through to personal token
    }
  }

  if (integration.apiKeyId) {
    const key = await getApiKey(integration.apiKeyId);
    if (key) return key.token;
  }
  return integration.auth.token;
}

// --- Root Workspace ---

export async function getRootPrimarySessionId(): Promise<string | null> {
  const store = await readStore();
  return store.rootWorkspace?.primarySessionId ?? null;
}

export async function setRootPrimarySessionId(
  sessionId: string | null
): Promise<void> {
  const store = await readStore();
  if (!store.rootWorkspace) {
    store.rootWorkspace = { primarySessionId: sessionId };
  } else {
    store.rootWorkspace.primarySessionId = sessionId;
  }
  await writeStore(store);
}

// --- Tmux Sessions ---

export async function getTmuxSessions(): Promise<SavedTmuxSession[]> {
  const store = await readStore();
  return store.tmuxSessions ?? [];
}

export async function saveTmuxSession(
  session: SavedTmuxSession
): Promise<SavedTmuxSession> {
  const store = await readStore();
  if (!store.tmuxSessions) store.tmuxSessions = [];
  const idx = store.tmuxSessions.findIndex(
    (s) => s.sessionName === session.sessionName
  );
  if (idx >= 0) {
    store.tmuxSessions[idx] = session;
  } else {
    store.tmuxSessions.push(session);
  }
  await writeStore(store);
  return session;
}

export async function removeTmuxSession(sessionName: string): Promise<boolean> {
  const store = await readStore();
  if (!store.tmuxSessions) return false;
  const idx = store.tmuxSessions.findIndex(
    (s) => s.sessionName === sessionName
  );
  if (idx < 0) return false;
  store.tmuxSessions.splice(idx, 1);
  await writeStore(store);
  return true;
}

// --- Email Configs ---

export async function getEmailConfigs(): Promise<WorkspaceEmailConfig[]> {
  const store = await readStore();
  return store.emailConfigs ?? [];
}

export async function getEmailConfigByAddress(
  address: string
): Promise<WorkspaceEmailConfig | null> {
  const store = await readStore();
  return (
    (store.emailConfigs ?? []).find(
      (c) => c.address.toLowerCase() === address.toLowerCase()
    ) ?? null
  );
}

export async function getEmailConfigBySlug(
  projectSlug: string
): Promise<WorkspaceEmailConfig | null> {
  const store = await readStore();
  return (
    (store.emailConfigs ?? []).find((c) => c.projectSlug === projectSlug) ??
    null
  );
}

export async function setEmailConfig(
  config: WorkspaceEmailConfig
): Promise<WorkspaceEmailConfig> {
  const store = await readStore();
  if (!store.emailConfigs) store.emailConfigs = [];
  const idx = store.emailConfigs.findIndex(
    (c) => c.projectSlug === config.projectSlug
  );
  if (idx >= 0) {
    store.emailConfigs[idx] = config;
  } else {
    store.emailConfigs.push(config);
  }
  await writeStore(store);
  return config;
}

export async function removeEmailConfig(projectSlug: string): Promise<boolean> {
  const store = await readStore();
  if (!store.emailConfigs) return false;
  const idx = store.emailConfigs.findIndex(
    (c) => c.projectSlug === projectSlug
  );
  if (idx < 0) return false;
  store.emailConfigs.splice(idx, 1);
  await writeStore(store);
  return true;
}

// --- Email Events ---

export async function addEmailEvent(event: EmailEvent): Promise<EmailEvent> {
  const store = await readStore();
  if (!store.emailEvents) store.emailEvents = [];
  store.emailEvents.push(event);
  if (store.emailEvents.length > 100) {
    store.emailEvents = store.emailEvents.slice(-100);
  }
  await writeStore(store);
  return event;
}

export async function updateEmailEventStatus(
  id: string,
  status: EmailEvent["status"],
  sessionId?: string
): Promise<void> {
  const store = await readStore();
  const event = (store.emailEvents ?? []).find((e) => e.id === id);
  if (!event) return;
  event.status = status;
  if (sessionId) event.sessionId = sessionId;
  await writeStore(store);
}

export async function getEmailEvents(
  projectSlug?: string
): Promise<EmailEvent[]> {
  const store = await readStore();
  const events = store.emailEvents ?? [];
  const filtered = projectSlug
    ? events.filter((e) => e.projectSlug === projectSlug)
    : events;
  return filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// --- OAuth Apps ---

export async function getOAuthApps(): Promise<OAuthApp[]> {
  const store = await readStore();
  return (store as any).oauthApps ?? [];
}

export async function getOAuthApp(
  provider: string
): Promise<OAuthApp | null> {
  const apps = await getOAuthApps();
  return apps.find((a) => a.provider === provider) ?? null;
}

export async function saveOAuthApp(app: OAuthApp): Promise<OAuthApp> {
  const store = await readStore();
  if (!(store as any).oauthApps) (store as any).oauthApps = [];
  const apps = (store as any).oauthApps as OAuthApp[];
  const idx = apps.findIndex((a) => a.provider === app.provider);
  if (idx >= 0) {
    apps[idx] = app;
  } else {
    apps.push(app);
  }
  await writeStore(store);
  return app;
}

export async function removeOAuthApp(provider: string): Promise<boolean> {
  const store = await readStore();
  const apps = ((store as any).oauthApps ?? []) as OAuthApp[];
  const idx = apps.findIndex((a) => a.provider === provider);
  if (idx < 0) return false;
  apps.splice(idx, 1);
  (store as any).oauthApps = apps;
  await writeStore(store);
  return true;
}
