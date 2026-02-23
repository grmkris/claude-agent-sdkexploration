import { getWebhook } from "@/lib/explorer-store";
import { extractEventKey } from "@/lib/webhook-event-catalog";
import { executeWebhook } from "@/lib/webhook-executor";
import { getProvider } from "@/lib/webhook-providers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const webhook = await getWebhook(id);
  if (!webhook) {
    return new Response("Not found", { status: 404 });
  }
  if (!webhook.enabled) {
    return new Response("Webhook disabled", { status: 403 });
  }

  const rawBody = await request.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Handle GitHub ping event
  if (
    webhook.provider === "github" &&
    request.headers.get("x-github-event") === "ping"
  ) {
    return new Response("pong", { status: 200 });
  }

  // Verify signature if secret is configured
  if (webhook.signingSecret) {
    const provider = getProvider(webhook.provider);
    const sigHeader = provider.getSignatureHeader();
    const signature = sigHeader ? request.headers.get(sigHeader) : null;
    if (!provider.verifySignature(rawBody, signature, webhook.signingSecret)) {
      return new Response("Invalid signature", { status: 401 });
    }
  }

  // Event filtering — only execute if event matches subscribed list
  if (webhook.subscribedEvents && webhook.subscribedEvents.length > 0) {
    const eventKey = extractEventKey(webhook.provider, body, request.headers);
    const matches = webhook.subscribedEvents.some(
      (e) => e === "*" || e === eventKey
    );
    if (!matches) {
      return new Response("Event filtered", { status: 200 });
    }
  }

  // Fire and forget - don't await
  executeWebhook(webhook, body, request.headers);

  return new Response("OK", { status: 200 });
}
