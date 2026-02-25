import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { query } from "@anthropic-ai/claude-agent-sdk";

import type { EmailAttachment, ParsedEmail } from "./email";
import type { WorkspaceEmailConfig } from "./types";

import { resolveSlugToPath, USER_HOME } from "./claude-fs";
import {
  addEmailEvent,
  updateEmailEventStatus,
  tagOutboundEmailEvents,
} from "./explorer-store";

const { CLAUDECODE: _CC, ...cleanEnv } = process.env;

/** Root directory where all inbound emails are materialized on disk */
const EMAILS_DIR = join(USER_HOME, "emails");

/**
 * Materializes an inbound email to disk as a structured directory:
 *
 *   ~/emails/{eventId}/
 *     email.md          — headers + body in readable markdown
 *     attachments/
 *       photo.jpg       — downloaded from Inbound API
 *       document.pdf
 *       ...
 *
 * Returns the absolute path to the email directory.
 * Claude can Read email.md and any attachment directly (images, PDFs, text).
 */
async function materializeEmail(
  email: ParsedEmail,
  eventId: string
): Promise<string> {
  const emailDir = join(EMAILS_DIR, eventId);
  const attachmentsDir = join(emailDir, "attachments");
  await mkdir(attachmentsDir, { recursive: true });

  // Build attachment table for email.md
  const downloadedAttachments: EmailAttachment[] = [];
  const apiKey = process.env.INBOUND_EMAIL_API_KEY;

  if (email.attachments.length > 0 && apiKey) {
    for (const att of email.attachments) {
      if (!att.downloadUrl || !att.filename) continue;
      try {
        const resp = await fetch(att.downloadUrl, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!resp.ok) {
          console.warn(
            `[email] Failed to download attachment "${att.filename}": HTTP ${resp.status}`
          );
          continue;
        }
        const buf = await resp.arrayBuffer();
        await writeFile(join(attachmentsDir, att.filename), Buffer.from(buf));
        downloadedAttachments.push(att);
      } catch (err) {
        console.warn(
          `[email] Error downloading attachment "${att.filename}":`,
          err
        );
      }
    }
  }

  // Build attachment section for email.md
  let attachmentSection = "";
  if (email.attachments.length > 0) {
    const rows = email.attachments.map((a) => {
      const sizeKb = Math.round(a.size / 1024);
      const downloaded = downloadedAttachments.some(
        (d) => d.filename === a.filename
      );
      const pathCol = downloaded
        ? `\`${join(attachmentsDir, a.filename)}\``
        : `*(download failed — URL: ${a.downloadUrl})*`;
      return `| ${a.filename} | ${a.contentType} | ${sizeKb} KB | ${a.contentDisposition} | ${pathCol} |`;
    });

    attachmentSection = `

## Attachments

| Filename | Type | Size | Disposition | Path |
|----------|------|------|-------------|------|
${rows.join("\n")}

> Use the \`Read\` tool on any path above to view the file.
> Images (jpg/png/gif/webp) and PDFs are natively supported — Claude can see their full content.`;
  }

  // Write email.md
  const emailMd = `# Email

**From:** ${email.from}
**To:** ${email.to}
**Subject:** ${email.subject}
**Date:** ${email.date}
**Message-ID:** ${email.messageId}

---

${email.body || "*(no body)*"}
${attachmentSection}
`;

  await writeFile(join(emailDir, "email.md"), emailMd, "utf8");
  return emailDir;
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
      // Materialize email + attachments to disk before spawning Claude
      const emailDir = await materializeEmail(email, eventId);

      const domain = process.env.CHANNEL_EMAIL_DOMAIN ?? "your-domain.com";
      const fromAddress = config.address || `agent@${domain}`;

      const prompt = `New email received. All content has been saved to disk.

Read \`${emailDir}/email.md\` to see the full email (headers, body, and attachment list).
Any attachments are in \`${emailDir}/attachments/\` — use the Read tool to view images and PDFs directly.

To reply, use the email_send tool:
  to: "${email.from}"
  subject: "Re: ${email.subject}"
  body: "your reply here"
  inReplyTo: "${email.messageId}"
  fromAddress: "${fromAddress}"

To reply with an attachment, add:
  attachments: [{ filePath: "${emailDir}/attachments/<filename>", filename: "<filename>" }]

Workspace instructions:
${config.prompt}`;

      const isRoot = config.projectSlug === "__root__";
      const cwd = isRoot
        ? USER_HOME
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

      if (capturedSessionId) {
        await tagOutboundEmailEvents(
          now,
          capturedSessionId,
          config.projectSlug
        );
      }
    } catch (err) {
      console.error("[email] Execution error:", err);
      await updateEmailEventStatus(eventId, "error");
    }
  })().catch((err) => console.error("[email] Unhandled:", err));
}
