import { parseInboundEmail, verifyWebhookToken } from "@/lib/email";
import { executeInboundEmail } from "@/lib/email-executor";
import {
  getEmailConfigByAddress,
  getEmailConfigBySlug,
} from "@/lib/explorer-store";

export async function POST(request: Request) {
  // Verify webhook token if configured
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (secret && !verifyWebhookToken(request.headers, secret)) {
    return new Response("Invalid webhook token", { status: 401 });
  }

  const rawBody = await request.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Parse the inbound email
  const email = parseInboundEmail(payload);
  if (!email) {
    return new Response("Invalid email payload", { status: 400 });
  }

  // Match recipient address to workspace email config
  let config = await getEmailConfigByAddress(email.recipient);

  // Fallback: try matching by the "to" address
  if (!config && email.to !== email.recipient) {
    config = await getEmailConfigByAddress(email.to);
  }

  // Fallback: try root workspace catch-all
  if (!config) {
    config = await getEmailConfigBySlug("__root__");
  }

  if (!config) {
    console.warn("[email] No email config found for:", email.recipient);
    return new Response("No matching email config", { status: 404 });
  }

  if (!config.enabled) {
    return new Response("Email config disabled", { status: 403 });
  }

  // Fire and forget
  executeInboundEmail(config, email);

  return new Response("OK", { status: 200 });
}
