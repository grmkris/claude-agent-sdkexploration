import { createLinearAdapter } from "@chat-adapter/linear";
import { createMemoryState } from "@chat-adapter/state-memory";
import { Chat } from "chat";

import {
  getLinearBotToken,
  getLinearOAuthCredentials,
  getLinearBotTokenTimestamp,
} from "../oauth/linear-client-credentials";
import { executeChatMessage } from "./chat-executor";

let _bot: Chat | null = null;
let _linearAdapterInitialized = false;
let _adapterTokenTimestamp = 0;

function createBot(): Chat {
  const bot = new Chat({
    userName: process.env.LINEAR_BOT_USERNAME ?? "claude-explorer",
    adapters: {},
    state: createMemoryState(),
  });

  bot.onNewMention(async (thread, message) => {
    await thread.subscribe();
    await executeChatMessage(thread, message, "mention");
  });

  bot.onSubscribedMessage(async (thread, message) => {
    await executeChatMessage(thread, message, "reply");
  });

  return bot;
}

/** Get or create the Chat instance (sync, no Linear adapter yet). */
export function getBot(): Chat {
  if (!_bot) {
    _bot = createBot();
  }
  return _bot;
}

/** Clear the bot singleton so it's recreated on next access. */
export function resetBot(): void {
  _bot = null;
  _linearAdapterInitialized = false;
  _adapterTokenTimestamp = 0;
}

/**
 * Initialize the Linear adapter using our bot token.
 * No-op if already initialized with current token.
 */
async function initLinearAdapter(): Promise<void> {
  const creds = await getLinearOAuthCredentials();
  if (!creds) return; // No OAuth creds configured — skip adapter

  const { accessToken } = await getLinearBotToken();
  const tokenTimestamp = getLinearBotTokenTimestamp();

  // Already initialized with this exact token
  if (_linearAdapterInitialized && tokenTimestamp === _adapterTokenTimestamp) {
    return;
  }

  // (Re)create bot with Linear adapter using the pre-obtained access token
  const linearAdapter = createLinearAdapter({
    accessToken,
    webhookSecret: process.env.LINEAR_WEBHOOK_SECRET,
  });

  _bot = new Chat({
    userName: process.env.LINEAR_BOT_USERNAME ?? "claude-explorer",
    adapters: { linear: linearAdapter },
    state: createMemoryState(),
  });

  _bot.onNewMention(async (thread, message) => {
    await thread.subscribe();
    await executeChatMessage(thread, message, "mention");
  });

  _bot.onSubscribedMessage(async (thread, message) => {
    await executeChatMessage(thread, message, "reply");
  });

  _linearAdapterInitialized = true;
  _adapterTokenTimestamp = tokenTimestamp;
}

/**
 * Get the bot with Linear adapter initialized (async).
 * Use this in webhook handlers that need the Linear adapter.
 */
export async function ensureBotReady(): Promise<Chat> {
  await initLinearAdapter();
  return getBot();
}
