import { query } from "@anthropic-ai/claude-agent-sdk";
import { join } from "node:path";

import type { ParsedEmail } from "./email";
import type { WorkspaceEmailConfig } from "./types";

import { resolveSlugToPath } from "./claude-fs";
import { addEmailEvent, updateEmailEventStatus } from "./explorer-store";

// Strip CLAUDECODE to allow the Agent SDK to spawn inside a Claude Code container
const { CLAUDECODE: _CC, ...cleanEnv } = process.env;

function formatEmailPrompt(
  email: ParsedEmail,
  config: WorkspaceEmailConfig
): string {
  const domain = process.env.CHANNEL_EMAIL_DOMAIN ?? "your-domain.com";
  const fromAddress = config.address || `agent@${domain}`;

  return `[Email Received]
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}

${email.body}

---
To reply, use the email_send tool:
  to: "${email.from}"
  subject: "Re: ${email.subject}"
  body: "your reply"
  inReplyTo: "${email.messageId}"
  fromAddress: "${fromAddress}"

Workspace instructions:
${config.prompt}`;
}

/**
 * Fire-and-forget inbound email handler.
 * Same pattern as webhook-executor.ts.
 */
export function executeInboundEmail(
  config: WorkspaceEmailConfig,
  email: ParsedEmail
): void {
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();

  (async () => {
    // Log event as running
    await addEmailEvent({
      id: eventId,
      projectSlug: config.projectSlug,
      timestamp: now,
      direction: "inbound",
      from: email.from,
      to: email.to,
      subject: email.subject,
      status: "running",
      messageId: email.messageId,
    });

    try {
      const prompt = formatEmailPrompt(email, config);

      // Resolve cwd for agent
      const isRoot = config.projectSlug === "__root__";
      const cwd = isRoot
        ? undefined
        : await resolveSlugToPath(config.projectSlug);

      // Build MCP server config for root workspace (so agent has email tools)
      const explorerServerPath = join(
        process.cwd(),
        "tools",
        "explorer-server.ts"
      );
      const baseUrl =
        process.env.EXPLORER_BASE_URL ??
        `http://localhost:${process.env.PORT ?? 3000}`;

      const conversation = query({
        prompt,
        options: {
          model: "claude-sonnet-4-6",
          executable: "bun",
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          env: cleanEnv,
          ...(cwd ? { cwd } : {}),
          ...(config.onInbound === "existing_session" && config.sessionId
            ? { resume: config.sessionId }
            : {}),
          mcpServers: {
            "claude-explorer": {
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
          },
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

      await updateEmailEventStatus(eventId, "success", capturedSessionId);
    } catch (err) {
      console.error("[email] Execution error:", err);
      await updateEmailEventStatus(eventId, "error");
    }
  })().catch((err) => console.error("[email] Unhandled:", err));
}
