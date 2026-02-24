import { query } from "@anthropic-ai/claude-agent-sdk";
import { join } from "node:path";

import type { ParsedEmail } from "./email";
import type { WorkspaceEmailConfig } from "./types";

import { resolveSlugToPath } from "./claude-fs";
import { addEmailEvent, updateEmailEventStatus } from "./explorer-store";

const { CLAUDECODE: _CC, ...cleanEnv } = process.env;

export function formatEmailPrompt(
  email: ParsedEmail,
  config: WorkspaceEmailConfig
): string {
  const domain = process.env.CHANNEL_EMAIL_DOMAIN ?? "your-domain.com";
  const fromAddress = config.address || `agent@${domain}`;

  let attachmentSection = "";
  if (email.attachments && email.attachments.length > 0) {
    const lines = email.attachments.map((a) => {
      const sizeKb = Math.round(a.size / 1024);
      return `- ${a.filename} (${a.contentType}, ${sizeKb}KB) — download: ${a.downloadUrl}`;
    });
    attachmentSection = `\n\n[Attachments]\n${lines.join("\n")}\n\nNote: Download and process these attachments using their URLs if needed.`;
  }

  return `[Email Received]
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}

${email.body}${attachmentSection}

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

export function executeInboundEmail(
  config: WorkspaceEmailConfig,
  email: ParsedEmail
): void {
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();

  (async () => {
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

      const isRoot = config.projectSlug === "__root__";
      const cwd = isRoot
        ? undefined
        : await resolveSlugToPath(config.projectSlug);

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
