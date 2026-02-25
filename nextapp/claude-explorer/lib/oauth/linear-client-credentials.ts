/**
 * Linear OAuth Client Credentials flow.
 * Exchanges client_id + client_secret for a 30-day app-actor token.
 * Actions taken with this token appear as the OAuth app (bot identity).
 */

import { readStore } from "../explorer-store";

interface TokenCache {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cached: TokenCache | null = null;

// 1-day buffer before expiry
const REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000;

function getCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId =
    process.env.LINEAR_CLIENT_ID ?? process.env.LINEAR_OAUTH_CLIENT_ID;
  const clientSecret =
    process.env.LINEAR_CLIENT_SECRET ?? process.env.LINEAR_OAUTH_CLIENT_SECRET;
  if (clientId && clientSecret) return { clientId, clientSecret };
  return null;
}

async function getStoreCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
} | null> {
  try {
    const store = await readStore();
    const app = (store as any).oauthApps?.find(
      (a: any) => a.provider === "linear"
    );
    if (app?.clientId && app?.clientSecret) {
      return { clientId: app.clientId, clientSecret: app.clientSecret };
    }
  } catch {
    // store read failed
  }
  return null;
}

export async function getLinearOAuthCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
} | null> {
  // Env vars take priority
  const envCreds = getCredentials();
  if (envCreds) return envCreds;
  // Fall back to store
  return getStoreCredentials();
}

export async function getLinearBotToken(): Promise<{
  accessToken: string;
  expiresAt: string;
}> {
  // Return cached if still valid
  if (cached && cached.expiresAt - Date.now() > REFRESH_BUFFER_MS) {
    return {
      accessToken: cached.accessToken,
      expiresAt: new Date(cached.expiresAt).toISOString(),
    };
  }

  const creds = await getLinearOAuthCredentials();
  if (!creds) {
    throw new Error("Linear OAuth credentials not configured");
  }

  const res = await fetch("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      scope: "read,write,comments:create,issues:create",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Linear token exchange failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope?: string[];
  };

  const expiresAt = Date.now() + data.expires_in * 1000;
  cached = { accessToken: data.access_token, expiresAt };

  return {
    accessToken: data.access_token,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function isLinearBotConfigured(): boolean {
  return !!getCredentials();
}

export async function isLinearBotConfiguredAsync(): Promise<boolean> {
  const creds = await getLinearOAuthCredentials();
  return !!creds;
}

/** Epoch ms when the current cached token was obtained (0 = no cache) */
export function getLinearBotTokenTimestamp(): number {
  if (!cached) return 0;
  // expiresAt minus ~30 days gives us approximate fetch time
  // But simpler: just use expiresAt as a stable identifier for "which token"
  return cached.expiresAt;
}

/** Clear cached token (useful on credential change) */
export function clearLinearBotTokenCache(): void {
  cached = null;
}
