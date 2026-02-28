import type { WebhookConfig } from "./types";

import {
  updateWebhookStatus,
  incrementWebhookTriggerCount,
  addWebhookEvent,
  updateWebhookEventStatus,
} from "./explorer-store";
import { emitActivity } from "./linear-agent";
import { spawnAgent } from "./spawn-agent";
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

  // For Linear agent session events, emit immediate "thinking" activity
  // (Linear requires a response within 10 seconds)
  const agentSessionId = (body as any)?.agentSession?.id as string | undefined;
  const isAgentSession =
    webhook.provider === "linear" && body.type === "agentSession";

  if (isAgentSession && agentSessionId) {
    emitActivity(
      agentSessionId,
      "thought",
      { body: "Analyzing..." },
      { ephemeral: true }
    ).catch((err) =>
      console.error("[webhook] Failed to emit initial thought:", err)
    );
  }

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
      let capturedSessionId: string | undefined;

      const conversation = spawnAgent({
        prompt,
        source: "webhook",
        projectSlug: webhook.projectSlug,
        resume: webhook.sessionId,
        onSessionId: (id) => {
          capturedSessionId = id;
        },
      });

      for await (const _msg of conversation) {
        // spawnAgent handles session ID capture + result metrics internally
      }

      await updateWebhookEventStatus(eventId, "success", capturedSessionId);
      await updateWebhookStatus(webhook.id, "success");
    } catch {
      await updateWebhookEventStatus(eventId, "error");
      await updateWebhookStatus(webhook.id, "error");
    }
  })().catch((err) => console.error("[webhook] Unhandled:", err));
}
