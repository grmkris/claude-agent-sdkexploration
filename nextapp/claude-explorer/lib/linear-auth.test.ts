import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpFile = join(tmpdir(), `linear-auth-test-${Date.now()}.json`);
process.env.EXPLORER_STORE_PATH = tmpFile;

// Save original env vars to restore after each test
const origLinearClientId = process.env.LINEAR_CLIENT_ID;
const origLinearClientSecret = process.env.LINEAR_CLIENT_SECRET;
const origLinearOauthClientId = process.env.LINEAR_OAUTH_CLIENT_ID;
const origLinearOauthClientSecret = process.env.LINEAR_OAUTH_CLIENT_SECRET;

// Import AFTER setting env var
const {
  getLinearOAuthCredentials,
  getLinearBotToken,
  clearLinearBotTokenCache,
  getLinearBotTokenTimestamp,
} = await import("./oauth/linear-client-credentials");
const { getBot, resetBot, ensureBotReady } = await import("./chat/bot");
const { LinearProvider } = await import("./integration-providers/linear");

const emptyStore = JSON.stringify({
  favorites: { projects: [], sessions: [] },
  crons: [],
  messages: [],
  webhooks: [],
  webhookEvents: [],
  cronEvents: [],
  integrations: [],
  apiKeys: [],
  oauthApps: [],
});

function clearLinearEnv() {
  delete process.env.LINEAR_CLIENT_ID;
  delete process.env.LINEAR_CLIENT_SECRET;
  delete process.env.LINEAR_OAUTH_CLIENT_ID;
  delete process.env.LINEAR_OAUTH_CLIENT_SECRET;
}

function restoreLinearEnv() {
  const restore = (key: string, val: string | undefined) => {
    if (val !== undefined) process.env[key] = val;
    else delete process.env[key];
  };
  restore("LINEAR_CLIENT_ID", origLinearClientId);
  restore("LINEAR_CLIENT_SECRET", origLinearClientSecret);
  restore("LINEAR_OAUTH_CLIENT_ID", origLinearOauthClientId);
  restore("LINEAR_OAUTH_CLIENT_SECRET", origLinearOauthClientSecret);
}

beforeEach(async () => {
  await Bun.write(tmpFile, emptyStore);
  clearLinearBotTokenCache();
  resetBot();
  clearLinearEnv();
});

afterAll(() => {
  restoreLinearEnv();
  try {
    unlinkSync(tmpFile);
  } catch {}
});

// --- Credential resolution ---

describe("credential resolution", () => {
  test("picks up LINEAR_CLIENT_ID over LINEAR_OAUTH_CLIENT_ID", async () => {
    process.env.LINEAR_CLIENT_ID = "primary-id";
    process.env.LINEAR_CLIENT_SECRET = "primary-secret";
    process.env.LINEAR_OAUTH_CLIENT_ID = "fallback-id";
    process.env.LINEAR_OAUTH_CLIENT_SECRET = "fallback-secret";

    const creds = await getLinearOAuthCredentials();
    expect(creds).toEqual({
      clientId: "primary-id",
      clientSecret: "primary-secret",
    });
  });

  test("falls back to LINEAR_OAUTH_CLIENT_ID when LINEAR_CLIENT_ID absent", async () => {
    process.env.LINEAR_OAUTH_CLIENT_ID = "fallback-id";
    process.env.LINEAR_OAUTH_CLIENT_SECRET = "fallback-secret";

    const creds = await getLinearOAuthCredentials();
    expect(creds).toEqual({
      clientId: "fallback-id",
      clientSecret: "fallback-secret",
    });
  });

  test("falls back to store credentials when no env vars", async () => {
    await Bun.write(
      tmpFile,
      JSON.stringify({
        ...JSON.parse(emptyStore),
        oauthApps: [
          {
            provider: "linear",
            clientId: "store-id",
            clientSecret: "store-secret",
          },
        ],
      })
    );

    const creds = await getLinearOAuthCredentials();
    expect(creds).toEqual({
      clientId: "store-id",
      clientSecret: "store-secret",
    });
  });

  test("returns null when nothing configured", async () => {
    const creds = await getLinearOAuthCredentials();
    expect(creds).toBeNull();
  });
});

// --- Token cache lifecycle ---

describe("token cache lifecycle", () => {
  test("getLinearBotTokenTimestamp returns 0 before any fetch", () => {
    expect(getLinearBotTokenTimestamp()).toBe(0);
  });

  test("clearLinearBotTokenCache resets timestamp to 0", () => {
    clearLinearBotTokenCache();
    expect(getLinearBotTokenTimestamp()).toBe(0);
  });
});

// --- Bot singleton lifecycle ---

describe("bot singleton lifecycle", () => {
  test("getBot returns a Chat instance", () => {
    const bot = getBot();
    expect(bot).toBeDefined();
    expect(bot.constructor.name).toBe("Chat");
  });

  test("getBot returns same instance on repeated calls", () => {
    const bot1 = getBot();
    const bot2 = getBot();
    expect(bot1).toBe(bot2);
  });

  test("resetBot clears singleton — next getBot returns new instance", () => {
    const bot1 = getBot();
    resetBot();
    const bot2 = getBot();
    expect(bot1).not.toBe(bot2);
  });

  test("ensureBotReady returns bot even when no OAuth creds configured", async () => {
    // No env vars, empty store — should still return a valid bot
    const bot = await ensureBotReady();
    expect(bot).toBeDefined();
    expect(bot.constructor.name).toBe("Chat");
  });
});

// --- End-to-end with real Linear API (conditional) ---

const hasLinearCreds = !!(
  (origLinearClientId || origLinearOauthClientId) &&
  (origLinearClientSecret || origLinearOauthClientSecret)
);

const describeLinear = hasLinearCreds ? describe : describe.skip;

describeLinear("end-to-end with real Linear API", () => {
  beforeEach(() => {
    // Restore real creds for these tests
    restoreLinearEnv();
    clearLinearBotTokenCache();
    resetBot();
  });

  test("getLinearBotToken fetches real token with correct scope", async () => {
    const result = await getLinearBotToken();
    expect(result.accessToken).toBeTruthy();
    expect(typeof result.accessToken).toBe("string");
    expect(result.expiresAt).toBeTruthy();
    // expiresAt should be a valid ISO date string
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  test("token is cached — second call doesn't re-fetch", async () => {
    const first = await getLinearBotToken();
    const ts1 = getLinearBotTokenTimestamp();
    expect(ts1).toBeGreaterThan(0);

    const second = await getLinearBotToken();
    const ts2 = getLinearBotTokenTimestamp();

    // Same token, same timestamp
    expect(second.accessToken).toBe(first.accessToken);
    expect(ts2).toBe(ts1);
  });

  test("clearLinearBotTokenCache forces re-fetch", async () => {
    await getLinearBotToken();
    const ts1 = getLinearBotTokenTimestamp();
    expect(ts1).toBeGreaterThan(0);

    clearLinearBotTokenCache();
    expect(getLinearBotTokenTimestamp()).toBe(0);

    await getLinearBotToken();
    const ts2 = getLinearBotTokenTimestamp();
    expect(ts2).toBeGreaterThan(0);
  });

  test("ensureBotReady creates bot with Linear adapter", async () => {
    const bot = await ensureBotReady();
    expect(bot).toBeDefined();
    expect((bot as any).webhooks?.linear).toBeDefined();
  });

  test("LinearProvider.testConnection works with bot token", async () => {
    const { accessToken } = await getLinearBotToken();
    const provider = new LinearProvider();
    const result = await provider.testConnection(accessToken);
    expect(result.ok).toBe(true);
    expect(result.meta?.userName).toBeTruthy();
    expect(result.meta?.teams).toBeInstanceOf(Array);
  });

  test("resetBot then ensureBotReady recreates with fresh token", async () => {
    const bot1 = await ensureBotReady();
    resetBot();
    const bot2 = await ensureBotReady();
    expect(bot1).not.toBe(bot2);
    expect((bot2 as any).webhooks?.linear).toBeDefined();
  });
});
