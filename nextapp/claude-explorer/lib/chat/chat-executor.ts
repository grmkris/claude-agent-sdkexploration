import type { Thread, Message } from "chat";

import { query } from "@anthropic-ai/claude-agent-sdk";
import { join } from "node:path";

import { upsertSession } from "../explorer-db";
import { createSessionHooks } from "../session-hooks";

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
    `Message from ${message.author?.fullName ?? "unknown"}:`,
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
        model: "claude-opus-4-6",
        executable: "bun",
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        env: cleanEnv,
        hooks: createSessionHooks("linear_chat"),
        mcpServers: getExplorerMcpConfig(),
      },
    });

    let responseText = "";
    let capturedSessionId: string | undefined;
    for await (const msg of conversation) {
      if (
        msg.type === "system" &&
        msg.subtype === "init" &&
        "session_id" in msg
      ) {
        capturedSessionId = msg.session_id as string;
        // Explicitly persist project_path — SDK hook input.cwd is unreliable.
        upsertSession(capturedSessionId, { project_path: process.cwd() });
      }
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            responseText += block.text;
          }
        }
      }
      if (capturedSessionId && msg.type === "result") {
        const r = msg as {
          total_cost_usd?: number;
          usage?: { input_tokens?: number; output_tokens?: number };
          num_turns?: number;
          duration_ms?: number;
          is_error?: boolean;
          subtype?: string;
        };
        upsertSession(capturedSessionId, {
          cost_usd: r.total_cost_usd ?? null,
          input_tokens: r.usage?.input_tokens ?? null,
          output_tokens: r.usage?.output_tokens ?? null,
          num_turns: r.num_turns ?? null,
          duration_ms: r.duration_ms ?? null,
          ...(r.is_error
            ? { state: "error", error: r.subtype ?? "error" }
            : {}),
        });
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
