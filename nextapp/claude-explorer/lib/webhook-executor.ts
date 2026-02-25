import { query } from "@anthropic-ai/claude-agent-sdk";
import { join } from "node:path";

import type { WebhookConfig } from "./types";

// Strip CLAUDECODE to allow the Agent SDK to spawn inside a Claude Code container
const { CLAUDECODE: _CC, ...cleanEnv } = process.env;

import { resolveSlugToPath } from "./claude-fs";
import { upsertSession } from "./explorer-db";
import {
  updateWebhookStatus,
  incrementWebhookTriggerCount,
  addWebhookEvent,
  updateWebhookEventStatus,
} from "./explorer-store";
import { emitActivity } from "./linear-agent";
import { createSessionHooks } from "./session-hooks";
import { getProvider } from "./webhook-providers";

// Explorer MCP server config — gives webhook-spawned Claude sessions access
// to Linear tools, email, crons, etc.
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
          env: cleanEnv,
          mcpServers: getExplorerMcpConfig(),
          hooks: createSessionHooks("webhook"),
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
            ...(r.is_error ? { state: "error", error: r.subtype ?? "error" } : {}),
          });
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
