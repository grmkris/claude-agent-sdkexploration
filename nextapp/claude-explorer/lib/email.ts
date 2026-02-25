import { readFile } from "node:fs/promises";

import type { InboundWebhookPayload } from "inboundemail";

import { Inbound } from "inboundemail";

export type EmailAttachment = {
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  contentDisposition: "attachment" | "inline";
  downloadUrl: string;
};

export type ParsedEmail = {
  from: string;
  to: string;
  subject: string;
  body: string;
  messageId: string;
  date: string;
  recipient: string;
  attachments: EmailAttachment[];
};

export function parseInboundEmail(payload: unknown): ParsedEmail | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (p.event !== "email.received") return null;

  const wh = payload as InboundWebhookPayload;
  const email = wh.email;
  if (!email) return null;

  const fromAddress = email.from?.addresses?.[0]?.address ?? "";
  const toAddress = email.to?.addresses?.[0]?.address ?? "";

  const rawAttachments = (email.parsedData as any)?.attachments ?? [];
  const attachments: EmailAttachment[] = Array.isArray(rawAttachments)
    ? rawAttachments.map((a: any) => ({
        filename: a.filename ?? "",
        contentType: a.contentType ?? "",
        size: a.size ?? 0,
        contentId: a.contentId,
        contentDisposition:
          a.contentDisposition === "inline" ? "inline" : "attachment",
        downloadUrl: a.downloadUrl ?? "",
      }))
    : [];

  return {
    from: fromAddress,
    to: toAddress,
    subject: email.subject ?? "",
    body: email.parsedData?.textBody ?? "",
    messageId: email.parsedData?.messageId ?? email.messageId ?? "",
    date: email.receivedAt ?? new Date().toISOString(),
    recipient: email.recipient ?? toAddress,
    attachments,
  };
}

export type OutboundAttachment = {
  /** Absolute path to a local file to attach */
  filePath: string;
  /** Filename as it will appear in the email */
  filename: string;
  /** MIME type, e.g. "image/jpeg". Inferred from extension if omitted. */
  contentType?: string;
};

export async function sendEmail(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  attachments?: OutboundAttachment[];
}): Promise<{ id: string; messageId: string }> {
  const headers: Record<string, string> = {};
  if (params.inReplyTo) {
    headers["In-Reply-To"] = params.inReplyTo;
    headers["References"] = params.inReplyTo;
  }

  // Read attachment files from disk and base64-encode them
  let attachments: Array<{ content: string; filename: string; content_type?: string }> | undefined;
  if (params.attachments && params.attachments.length > 0) {
    attachments = await Promise.all(
      params.attachments.map(async (att) => {
        const buf = await readFile(att.filePath);
        return {
          content: buf.toString("base64"),
          filename: att.filename,
          ...(att.contentType ? { content_type: att.contentType } : {}),
        };
      })
    );
  }

  const inbound = new Inbound({ apiKey: process.env.INBOUND_EMAIL_API_KEY });
  const result = await inbound.emails.send({
    from: params.from,
    to: params.to,
    subject: params.subject,
    text: params.body,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(attachments ? { attachments } : {}),
  });

  return {
    id: result.id,
    messageId: result.message_id ?? "",
  };
}

export function verifyWebhookToken(headers: Headers, secret: string): boolean {
  if (!secret) return true;
  const token = headers.get("x-webhook-verification-token");
  return token === secret;
}
