import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { query } from "@anthropic-ai/claude-agent-sdk";

import type { EmailAttachment, ParsedEmail } from "./email";
import type { WorkspaceEmailConfig } from "./types";

import { USER_HOME, resolveSlugToPath } from "./claude-fs";
import {
  addEmailEvent,
  tagOutboundEmailEvents,
  updateEmailEventStatus,
} from "./explorer-store";

const { CLAUDECODE: _CC, ...cleanEnv } = process.env;

/** Root directory where materialised email directories are stored */
const EMAIL_STORE = join(USER_HOME, "emails");

/**
 * Download a single attachment from the Inbound API to disk.
 * Returns the local path on success, null on failure.
 */
async function downloadAttachment(
  att: EmailAttachment,
  destDir: string,
  apiKey: string
): Promise<string | null> {
  if (!att.downloadUrl) return null;
  try {
    const resp = await fetch(att.downloadUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const safeName =
      att.filename.replace(/[^a-zA-Z0-9._-]/g, "_") ||
      `file-${crypto.randomUUID()}`;
    const localPath = join(destDir, safeName);
    await writeFile(localPath, Buffer.from(buf));
    return localPath;
  } catch (err) {
    console.warn(`[email] Failed to download attachment "${att.filename}":`, err);
    return null;
  }
}

/**
 * Materialise a parsed email to a directory on disk:
 *
 *   ~/emails/{eventId}/
 *     email.md          — structured markdown: headers + body + attachment table
 *     attachments/      — downloaded attachment files (images, PDFs, …)
 *
 * Claude Code's Read tool natively renders images and PDFs, so the spawned
 * session can see inline images pixel-by-pixel just by reading the file.
 *
 * Returns the absolute path to the email directory.
 */
async function materializeEmail(
  email: ParsedEmail,
  eventId: string
): Promise<string> {
  const emailDir = join(EMAIL_STORE, eventId);
  const attachmentsDir = join(emailDir, "attachments");
  await mkdir(attachmentsDir, { recursive: true });

  const apiKey = process.env.INBOUND_EMAIL_API_KEY ?? "";

  // Download all attachments in parallel
  const resolved = await Promise.all(
    email.attachments.map(async (att) => ({
      att,
      localPath: apiKey
        ? await downloadAttachment(att, attachmentsDir, apiKey)
        : null,
    }))
  );

  // Build attachment table for email.md
  const attachmentRows = resolved
    .map(({ att, localPath }) => {
      const sizeKb = Math.round(att.size / 1024);
      const disposition =
        att.contentDisposition === "inline" ? "inline" : "attachment";
      const path = localPath
        ? `attachments/${att.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`
        : `*(unavailable — download: ${att.downloadUrl})*`;
      return `| ${att.filename || "(unnamed)"} | ${att.contentType} | ${sizeKb} KB | ${disposition} | ${path} |`;
    })
    .join("\n");

  const attachmentSection =
    resolved.length > 0
      ? `\n\n## Attachments\n\n| Filename | Type | Size | Disposition | Path |\n|----------|------|------|-------------|------|\n${attachmentRows}\n\n> Use the \`Read\` tool to open image or PDF files — they will be rendered visually.`
      : "";

  const emailMd = `# Email

**From:** ${email.from}
**To:** ${email.to}
**Subject:** ${email.subject}
**Date:** ${email.date}
**Message-ID:** \`${email.messageId}\`

---

${email.body || "*(no text body)*"}
${attachmentSection}
`;

  await writeFile(join(emailDir, "email.md"), emailMd, "utf-8");
  return emailDir;
}

/** Build the short pointer prompt that points Claude at the email directory */
function formatEmailPrompt(
  emailDir: string,
  config: WorkspaceEmailConfig
): string {
  const domain = process.env.CHANNEL_EMAIL_DOMAIN ?? "your-domain.com";
  const fromAddress = config.address || `agent@${domain}`;

  return `New email received. All content has been saved to:

  ${emailDir}/email.md

Read that file to see the full email (headers, body, attachments).
Attachments (images, PDFs, …) live in ${emailDir}/attachments/ — use the Read tool to view them; images will be rendered visually.

When replying use the email_send tool:
  - \`to\`:          the sender's address (From: field in email.md)
  - \`subject\`:     "Re: " + the original subject
  - \`inReplyTo\`:   the Message-ID value in email.md
  - \`fromAddress\`: "${fromAddress}"
  - \`attachments\`: optional — array of { filePath, filename } for files to attach

---

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
      // 1. Materialise email → ~/emails/{eventId}/
      const emailDir = await materializeEmail(email, eventId);

      // 2. Build a short pointer prompt
      const prompt = formatEmailPrompt(emailDir, config);

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
        await tagOutboundEmailEvents(now, capturedSessionId, config.projectSlug);
      }
    } catch (err) {
      console.error("[email] Execution error:", err);
      await updateEmailEventStatus(eventId, "error");
    }
  })().catch((err) => console.error("[email] Unhandled:", err));
}
