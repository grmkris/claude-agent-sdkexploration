import { query } from "@anthropic-ai/claude-agent-sdk";

import type { WebhookConfig } from "./types";

import { resolveSlugToPath } from "./claude-fs";
import {
  updateWebhookStatus,
  incrementWebhookTriggerCount,
  addWebhookEvent,
  updateWebhookEventStatus,
} from "./explorer-store";
import { getProvider } from "./webhook-providers";

export function executeWebhook(
  webhook: WebhookConfig,
  body: Record<string, unknown>,
  headers: Headers
): void {
  const provider = getProvider(webhook.provider);
  const { eventType, action, summary } = provider.extractEventInfo(
    body,
    headers
  );
  const prompt = provider.formatPrompt(body, headers, webhook.prompt);

  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Fire and forget
  (async () => {
    // Log event as running
    await addWebhookEvent({
      id: eventId,
      webhookId: webhook.id,
      timestamp: now,
      provider: webhook.provider,
      eventType,
      action,
      payloadSummary: summary.slice(0, 200),
      status: "running",
    });
    await incrementWebhookTriggerCount(webhook.id);
    await updateWebhookStatus(webhook.id, "running", now);

    try {
      const cwd = webhook.projectSlug
        ? await resolveSlugToPath(webhook.projectSlug)
        : undefined;
      const conversation = query({
        prompt,
        options: {
          model: "claude-sonnet-4-6",
          executable: "bun",
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,

          ...(cwd ? { cwd } : {}),
          ...(webhook.sessionId ? { resume: webhook.sessionId } : {}),
        },
      });

      let capturedSessionId: string | undefined;
      for await (const msg of conversation) {
        if (
          msg.type === "system" &&
          msg.subtype === "init" &&
          "session_id" in msg
        ) {
          capturedSessionId = msg.session_id as string;
        }
      }

      await updateWebhookEventStatus(eventId, "success", capturedSessionId);
      await updateWebhookStatus(webhook.id, "success");
    } catch {
      await updateWebhookEventStatus(eventId, "error");
      await updateWebhookStatus(webhook.id, "error");
    }
  })().catch((err) => console.error("[webhook] Unhandled:", err));
}
