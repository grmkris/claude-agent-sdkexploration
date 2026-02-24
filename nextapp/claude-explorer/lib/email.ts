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

export async function sendEmail(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
}): Promise<{ id: string; messageId: string }> {
  const headers: Record<string, string> = {};
  if (params.inReplyTo) {
    headers["In-Reply-To"] = params.inReplyTo;
    headers["References"] = params.inReplyTo;
  }

  const inbound = new Inbound({ apiKey: process.env.INBOUND_EMAIL_API_KEY });
  const result = await inbound.emails.send({
    from: params.from,
    to: params.to,
    subject: params.subject,
    text: params.body,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
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
