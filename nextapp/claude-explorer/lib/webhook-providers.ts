import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebhookProvider {
  verifySignature(
    rawBody: string,
    signature: string | null,
    secret: string
  ): boolean;
  getSignatureHeader(): string;
  formatPrompt(
    body: Record<string, unknown>,
    headers: Headers,
    userPrompt: string
  ): string;
  extractEventInfo(
    body: Record<string, unknown>,
    headers: Headers
  ): {
    eventType: string;
    action: string;
    summary: string;
  };
}

const linearProvider: WebhookProvider = {
  getSignatureHeader() {
    return "Linear-Signature";
  },

  verifySignature(rawBody, signature, secret) {
    if (!signature) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  },

  extractEventInfo(body, headers) {
    const eventType = (headers.get("Linear-Event") as string) ?? "unknown";
    const action = (body.action as string) ?? "unknown";
    const data = body.data as Record<string, unknown> | undefined;
    const rawTitle = data?.title ?? data?.body ?? data?.name ?? "";
    const title =
      typeof rawTitle === "string" ? rawTitle : JSON.stringify(rawTitle);
    const summary = `${eventType} ${action}: ${title.slice(0, 200)}`;
    return { eventType, action, summary };
  },

  formatPrompt(body, headers, userPrompt) {
    const { eventType, action } = this.extractEventInfo(body, headers);
    return [
      `[Linear Webhook] Event: ${eventType}, Action: ${action}`,
      "",
      "Payload:",
      "```json",
      JSON.stringify(body, null, 2),
      "```",
      "",
      "Instructions:",
      userPrompt,
    ].join("\n");
  },
};

const githubProvider: WebhookProvider = {
  getSignatureHeader() {
    return "x-hub-signature-256";
  },

  verifySignature(rawBody, signature, secret) {
    if (!signature) return false;
    const expected =
      "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  },

  extractEventInfo(body, headers) {
    const eventType = (headers.get("x-github-event") as string) ?? "unknown";
    const action = (body.action as string) ?? "unknown";
    const rawRepo =
      (body.repository as Record<string, unknown>)?.full_name ?? "";
    const repo =
      typeof rawRepo === "string" ? rawRepo : JSON.stringify(rawRepo);
    const summary = `${eventType} ${action}: ${repo.slice(0, 200)}`;
    return { eventType, action, summary };
  },

  formatPrompt(body, headers, userPrompt) {
    const { eventType, action } = this.extractEventInfo(body, headers);
    return [
      `[GitHub Webhook] Event: ${eventType}, Action: ${action}`,
      "",
      "Payload:",
      "```json",
      JSON.stringify(body, null, 2),
      "```",
      "",
      "Instructions:",
      userPrompt,
    ].join("\n");
  },
};

const genericProvider: WebhookProvider = {
  getSignatureHeader() {
    return "";
  },

  verifySignature() {
    return true;
  },

  extractEventInfo(body) {
    const keys = Object.keys(body).slice(0, 5).join(", ");
    return {
      eventType: "generic",
      action: "received",
      summary: `Generic webhook with keys: ${keys}`,
    };
  },

  formatPrompt(body, _headers, userPrompt) {
    return [
      "[Webhook] Incoming payload:",
      "",
      "```json",
      JSON.stringify(body, null, 2),
      "```",
      "",
      "Instructions:",
      userPrompt,
    ].join("\n");
  },
};

const railwayProvider: WebhookProvider = {
  getSignatureHeader() {
    return "";
  },

  verifySignature() {
    return true; // Railway uses URL-based auth (random UUID in path)
  },

  extractEventInfo(body) {
    const eventType = (body.type as string) ?? "unknown";
    const resource = body.resource as Record<string, unknown> | undefined;
    const service = resource?.service as Record<string, unknown> | undefined;
    const serviceName = (service?.name as string) ?? "";
    const summary = `${eventType}: ${serviceName}`.slice(0, 200);
    return { eventType, action: eventType, summary };
  },

  formatPrompt(body, _headers, userPrompt) {
    const eventType = (body.type as string) ?? "unknown";
    return [
      `[Railway Webhook] Event: ${eventType}`,
      "",
      "Payload:",
      "```json",
      JSON.stringify(body, null, 2),
      "```",
      "",
      "Instructions:",
      userPrompt,
    ].join("\n");
  },
};

const providers: Record<string, WebhookProvider> = {
  linear: linearProvider,
  github: githubProvider,
  generic: genericProvider,
  railway: railwayProvider,
};

export function getProvider(name: string): WebhookProvider {
  return providers[name] ?? genericProvider;
}
