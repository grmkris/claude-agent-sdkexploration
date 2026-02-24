import { createLinearAdapter } from "@chat-adapter/linear";
import { createMemoryState } from "@chat-adapter/state-memory";
import { Chat } from "chat";

import { executeChatMessage } from "./chat-executor";

let _bot: Chat | null = null;

export function getBot(): Chat {
  if (_bot) return _bot;

  const adapters: Record<string, ReturnType<typeof createLinearAdapter>> = {};

  const clientId =
    process.env.LINEAR_CLIENT_ID ?? process.env.LINEAR_OAUTH_CLIENT_ID;
  const clientSecret =
    process.env.LINEAR_CLIENT_SECRET ?? process.env.LINEAR_OAUTH_CLIENT_SECRET;

  if (clientId && clientSecret) {
    adapters.linear = createLinearAdapter({
      clientId,
      clientSecret,
      webhookSecret: process.env.LINEAR_WEBHOOK_SECRET,
    });
  }

  _bot = new Chat({
    userName: process.env.LINEAR_BOT_USERNAME ?? "claude-explorer",
    adapters,
    state: createMemoryState(),
  });

  _bot.onNewMention(async (thread, message) => {
    await thread.subscribe();
    await executeChatMessage(thread, message, "mention");
  });

  _bot.onSubscribedMessage(async (thread, message) => {
    await executeChatMessage(thread, message, "reply");
  });

  return _bot;
}
