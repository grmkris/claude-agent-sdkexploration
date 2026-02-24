import type { Thread, Message } from "chat";

import { query } from "@anthropic-ai/claude-agent-sdk";
import { join } from "node:path";

const { CLAUDECODE: _CC, ...cleanEnv } = process.env;

const explorerServerPath = join(process.cwd(), "tools", "explorer-server.ts");
const baseUrl =
  process.env.EXPLORER_BASE_URL ??
  `http://localhost:${process.env.PORT ?? 3000}`;

function getExplorerMcpConfig() {
  return {
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
  };
}

function formatPrompt(
  thread: Thread,
  message: Message,
  trigger: "mention" | "reply"
): string {
  const lines = [
    `[Chat Message] Platform: ${thread.adapter.name}, Trigger: ${trigger}`,
    `Thread: ${thread.id}`,
    "",
    `Message from ${message.author?.name ?? "unknown"}:`,
    message.text,
    "",
    "Respond helpfully. Do NOT use linear_addComment — your response will be posted automatically.",
  ];
  return lines.join("\n");
}

export async function executeChatMessage(
  thread: Thread,
  message: Message,
  trigger: "mention" | "reply"
): Promise<void> {
  const prompt = formatPrompt(thread, message, trigger);

  try {
    const conversation = query({
      prompt,
      options: {
        model: "claude-sonnet-4-6",
        executable: "bun",
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        env: cleanEnv,
        mcpServers: getExplorerMcpConfig(),
      },
    });

    let responseText = "";
    for await (const msg of conversation) {
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            responseText += block.text;
          }
        }
      }
    }

    if (responseText) {
      await thread.post(responseText);
    }
  } catch (err) {
    console.error("[chat-executor] Error:", err);
    await thread.post("Sorry, I encountered an error processing your message.");
  }
}
