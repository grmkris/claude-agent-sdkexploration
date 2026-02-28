import type { Thread, Message } from "chat";

import type { SDKMessage } from "../types";

import { spawnAgent } from "../spawn-agent";

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
    let responseText = "";

    const conversation = spawnAgent({
      prompt,
      source: "linear_chat",
      // Note: linear_chat previously had no cwd — now spawnAgent defaults to
      // process.cwd() which is the app dir. If a projectSlug becomes available
      // from the thread context in the future, pass it here.
    });

    for await (const msg of conversation) {
      const m = msg as SDKMessage;
      if (m.type === "assistant" && m.message?.content) {
        for (const block of m.message.content) {
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
