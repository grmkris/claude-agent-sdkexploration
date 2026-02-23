import type { IntegrationConfig, IntegrationWidget } from "./types";

import { GitHubProvider } from "./integration-providers/github";
import { LinearProvider } from "./integration-providers/linear";
import { RailwayProvider } from "./integration-providers/railway";

export interface IntegrationProvider {
  type: string;
  testConnection(
    token: string,
    config?: Record<string, unknown>
  ): Promise<{
    ok: boolean;
    error?: string;
    meta?: {
      userName?: string;
      teams?: { id: string; name: string }[];
      projects?: { id: string; name: string }[];
    };
  }>;
  fetchWidgets(integration: IntegrationConfig): Promise<IntegrationWidget[]>;
}

// --- In-memory cache (60s TTL, stale-while-revalidate on errors) ---

type CacheEntry = { widgets: IntegrationWidget[]; fetchedAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000;

export function getCachedWidgets(
  integrationId: string
): IntegrationWidget[] | null {
  const entry = cache.get(integrationId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt < CACHE_TTL) return entry.widgets;
  return null;
}

export function getStaleCachedWidgets(
  integrationId: string
): IntegrationWidget[] | null {
  return cache.get(integrationId)?.widgets ?? null;
}

export function setCachedWidgets(
  integrationId: string,
  widgets: IntegrationWidget[]
): void {
  cache.set(integrationId, { widgets, fetchedAt: Date.now() });
}

// --- Provider registry ---

const providers: Record<string, IntegrationProvider> = {
  linear: new LinearProvider(),
  railway: new RailwayProvider(),
  github: new GitHubProvider(),
};

export function getProvider(type: string): IntegrationProvider | null {
  return providers[type] ?? null;
}

export function getProviderTypes(): string[] {
  return Object.keys(providers);
}
