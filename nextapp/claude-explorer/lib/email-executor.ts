import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { EmailAttachment, ParsedEmail } from "./email";
import type { WorkspaceEmailConfig } from "./types";

import { USER_HOME, resolveSlugToPath } from "./claude-fs";
import {
  addEmailEvent,
  tagOutboundEmailEvents,
  updateEmailEventAttachments,
  updateEmailEventStatus,
} from "./explorer-store";
import { spawnAgent } from "./spawn-agent";

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
    console.warn(
      `[email] Failed to download attachment "${att.filename}":`,
      err
    );
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
interface MaterializedEmail {
  emailDir: string;
  attachmentFilenames: string[]; // sanitized filenames that were successfully downloaded
}

async function materializeEmail(
  email: ParsedEmail,
  eventId: string
): Promise<MaterializedEmail> {
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

  // Collect sanitized filenames for successfully downloaded attachments
  const attachmentFilenames = resolved
    .filter(({ localPath }) => localPath !== null)
    .map(
      ({ att }) =>
        att.filename.replace(/[^a-zA-Z0-9._-]/g, "_") ||
        `file-${crypto.randomUUID()}`
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
  return { emailDir, attachmentFilenames };
}

/** Build the prompt for Claude with the full email content embedded inline */
export function formatEmailPrompt(
  email: ParsedEmail,
  config: WorkspaceEmailConfig
): string {
  const domain = process.env.CHANNEL_EMAIL_DOMAIN ?? "your-domain.com";
  const fromAddress = config.address || `agent@${domain}`;

  let prompt = `[Email Received]
From: ${email.from}
To: ${email.to}
Subject: ${email.subject}
Date: ${email.date}

${email.body}`;

  if (email.attachments.length > 0) {
    prompt += `\n\n[Attachments]`;
    for (const att of email.attachments) {
      const sizeKb = Math.round(att.size / 1024);
      prompt += `\n- ${att.filename} (${att.contentType}, ${sizeKb}KB) — ${att.downloadUrl}`;
    }
    prompt += `\n\nNote: Download and process these attachments using their URLs if needed.`;
  }

  prompt += `\n\n---
When replying, use the email_send tool with:
  to: "${email.from}"
  subject: "Re: ${email.subject}"
  inReplyTo: "${email.messageId}"
  fromAddress: "${fromAddress}"
  attachments: optional — array of { filePath, filename } for files to attach

---

Workspace instructions:
${config.prompt}`;

  return prompt;
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
      body: email.body || undefined,
    });

    try {
      // 1. Materialise email → ~/emails/{eventId}/ (keeps attachments on disk)
      const { emailDir, attachmentFilenames } = await materializeEmail(
        email,
        eventId
      );

      // Store attachment filenames so the thread view can serve them
      if (attachmentFilenames.length > 0) {
        await updateEmailEventAttachments(eventId, attachmentFilenames);
      }

      // 2. Build pointer-style prompt — Claude reads the file directly.
      //    The Read tool natively renders images and PDFs, so attachments are
      //    visible pixel-by-pixel without any download step.
      const domain = process.env.CHANNEL_EMAIL_DOMAIN ?? "your-domain.com";
      const fromAddress = config.address || `agent@${domain}`;
      const reSubject = email.subject.startsWith("Re:")
        ? email.subject
        : `Re: ${email.subject}`;
      const prompt = `A new email has arrived and been saved to disk.

Read the file at: ${emailDir}/email.md

If the email has attachments, they are in ${emailDir}/attachments/ — use the Read tool to open image or PDF files and you will see them rendered visually.

When ready to reply, use the email_send tool:
  to: "${email.from}"
  subject: "${reSubject}"
  inReplyTo: "${email.messageId}"
  fromAddress: "${fromAddress}"

Workspace instructions:
${config.prompt}`;

      const isRoot = config.projectSlug === "__root__";
      const cwd = isRoot
        ? USER_HOME
        : await resolveSlugToPath(config.projectSlug);

      let capturedSessionId: string | undefined;

      const conversation = spawnAgent({
        prompt,
        source: "email",
        cwd,
        projectSlug: config.projectSlug,
        resume:
          config.onInbound === "existing_session" && config.sessionId
            ? config.sessionId
            : undefined,
        onSessionId: (id) => {
          capturedSessionId = id;
        },
      });

      for await (const _msg of conversation) {
        // spawnAgent handles session ID capture + result metrics internally
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
