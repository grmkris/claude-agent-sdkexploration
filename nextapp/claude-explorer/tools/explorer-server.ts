import type { RouterClient } from "@orpc/server";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { z } from "zod";

import type { router } from "../lib/procedures";

const baseUrl = process.env.EXPLORER_BASE_URL ?? "http://localhost:3000";
const link = new RPCLink({
  url: process.env.EXPLORER_RPC_URL ?? `${baseUrl}/rpc`,
});
const client: RouterClient<typeof router> = createORPCClient(link);

const server = new McpServer({
  name: "claude-explorer",
  version: "1.0.0",
});

// --- Cron tools ---

server.tool(
  "cron_create",
  "Create a scheduled cron job that runs a prompt on a schedule",
  {
    expression: z
      .string()
      .describe("Cron expression (e.g. '*/5 * * * *' for every 5 min)"),
    prompt: z.string().describe("The prompt to execute when cron fires"),
    projectSlug: z
      .string()
      .describe("Project slug (path with / replaced by -)"),
    sessionId: z.string().optional().describe("Optional session ID to resume"),
  },
  async ({ expression, prompt, projectSlug, sessionId }) => {
    const cron = await client.crons.create({
      expression,
      prompt,
      projectSlug,
      sessionId,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(cron, null, 2) }],
    };
  }
);

server.tool("cron_list", "List all registered cron jobs", {}, async () => {
  const crons = await client.crons.list();
  return {
    content: [{ type: "text" as const, text: JSON.stringify(crons, null, 2) }],
  };
});

server.tool(
  "cron_delete",
  "Delete a cron job by ID",
  { id: z.string().describe("Cron job ID to delete") },
  async ({ id }) => {
    const result = await client.crons.delete({ id });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  }
);

server.tool(
  "cron_toggle",
  "Enable or disable a cron job",
  { id: z.string().describe("Cron job ID to toggle") },
  async ({ id }) => {
    const cron = await client.crons.toggle({ id });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(cron, null, 2) }],
    };
  }
);

// --- Webhook tools ---

server.tool(
  "webhook_create",
  "Create a webhook that triggers a Claude prompt when an external service POSTs to it",
  {
    name: z.string().describe("Human-readable name for the webhook"),
    provider: z
      .enum(["linear", "github", "generic"])
      .describe("Webhook provider for signature verification"),
    prompt: z.string().describe("The prompt to execute when webhook fires"),
    projectSlug: z
      .string()
      .optional()
      .describe("Project slug (path with / replaced by -). Omit for global"),
    sessionId: z.string().optional().describe("Optional session ID to resume"),
    signingSecret: z
      .string()
      .optional()
      .describe("Secret for signature verification"),
  },
  async ({ name, provider, prompt, projectSlug, sessionId, signingSecret }) => {
    const wh = await client.webhooks.create({
      name,
      provider,
      prompt,
      projectSlug,
      sessionId,
      signingSecret,
    });
    const url = `${baseUrl}/api/webhooks/${wh.id}`;
    return {
      content: [
        {
          type: "text" as const,
          text: `Created webhook. URL: ${url}\n\n${JSON.stringify(wh, null, 2)}`,
        },
      ],
    };
  }
);

server.tool("webhook_list", "List all registered webhooks", {}, async () => {
  const webhooks = await client.webhooks.list();
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(webhooks, null, 2) },
    ],
  };
});

server.tool(
  "webhook_delete",
  "Delete a webhook by ID",
  { id: z.string().describe("Webhook ID to delete") },
  async ({ id }) => {
    const result = await client.webhooks.delete({ id });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  }
);

server.tool(
  "webhook_toggle",
  "Enable or disable a webhook",
  { id: z.string().describe("Webhook ID to toggle") },
  async ({ id }) => {
    const wh = await client.webhooks.toggle({ id });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(wh, null, 2) }],
    };
  }
);

server.tool(
  "webhook_events",
  "List recent webhook delivery events",
  {
    webhookId: z
      .string()
      .optional()
      .describe("Optional webhook ID to filter events"),
  },
  async ({ webhookId }) => {
    const events = await client.webhooks.events({ webhookId });
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(events, null, 2) },
      ],
    };
  }
);

// --- Message tools ---

server.tool(
  "message_send",
  "Send a message to another Claude session or project",
  {
    fromProjectSlug: z.string().describe("Sender's project slug"),
    fromSessionId: z.string().describe("Sender's session ID"),
    toProjectSlug: z.string().describe("Recipient's project slug"),
    toSessionId: z
      .string()
      .optional()
      .describe("Recipient's session ID (omit for project-wide)"),
    body: z.string().describe("Message body"),
  },
  async ({
    fromProjectSlug,
    fromSessionId,
    toProjectSlug,
    toSessionId,
    body,
  }) => {
    const msg = await client.messages.send({
      from: { projectSlug: fromProjectSlug, sessionId: fromSessionId },
      to: { projectSlug: toProjectSlug, sessionId: toSessionId },
      body,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(msg, null, 2) }],
    };
  }
);

server.tool(
  "message_list",
  "List messages for a project/session",
  {
    projectSlug: z.string().describe("Project slug to list messages for"),
    sessionId: z.string().optional().describe("Optional session ID filter"),
  },
  async ({ projectSlug, sessionId }) => {
    const msgs = await client.messages.list({ projectSlug, sessionId });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(msgs, null, 2) }],
    };
  }
);

server.tool(
  "message_read",
  "Mark a message as read",
  { id: z.string().describe("Message ID to mark as read") },
  async ({ id }) => {
    const msg = await client.messages.markRead({ id });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(msg, null, 2) }],
    };
  }
);

// --- Start ---

const transport = new StdioServerTransport();
await server.connect(transport);
