import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RouterClient } from "@orpc/server";

import { traverseContractProcedures } from "@orpc/server";

import type { router } from "../../lib/procedures";

/** Only expose these top-level router keys as MCP tools (keeps agent context small) */
const INCLUDE_PREFIXES = new Set(["crons", "webhooks", "email"]);

/** Tool descriptions keyed by flattened path (e.g. "crons_create") */
const DESCRIPTIONS: Record<string, string> = {
  // Crons
  crons_list: "List all registered cron jobs",
  crons_create: "Create a scheduled cron job that runs a prompt on a schedule",
  crons_delete: "Delete a cron job by ID",
  crons_toggle: "Enable or disable a cron job",
  crons_events: "List recent cron execution events",

  // Webhooks
  webhooks_list: "List all registered webhooks",
  webhooks_create:
    "Create a webhook that triggers a Claude prompt when an external service POSTs to it",
  webhooks_delete: "Delete a webhook by ID",
  webhooks_toggle: "Enable or disable a webhook",
  webhooks_events: "List recent webhook delivery events",
  webhooks_createForIntegration:
    "Create a webhook linked to an integration with auto-registration on the provider",
  webhooks_eventCatalog:
    "Get available webhook event types and prompt templates for a provider",
  webhooks_setupInstructions:
    "Get setup instructions and dashboard URL for a webhook",

  // Email
  email_getConfig: "Get email configuration for a workspace",
  email_setConfig:
    "Configure email address and inbound behavior for a workspace",
  email_removeConfig: "Remove email configuration for a workspace",
  email_send:
    "Send an email. Supports replies with threading via inReplyTo parameter.",
  email_events: "List recent email events (sent and received)",
  email_getContent: "email.getContent procedure",
  email_listConfigs: "List all configured email addresses across workspaces",
  email_domain: "Get the email domain for this instance",
};

/**
 * Post-processors for tools that need to augment the raw procedure result.
 * Receives the result and returns modified content text.
 */
type PostProcessor = (result: unknown, baseUrl: string) => string;

const POST_PROCESSORS: Record<string, PostProcessor> = {
  webhooks_create: (result, baseUrl) => {
    const wh = result as { id: string };
    const url = `${baseUrl}/api/webhooks/${wh.id}`;
    return `Created webhook. URL: ${url}\n\n${JSON.stringify(result, null, 2)}`;
  },
};

export function registerAllTools(
  server: McpServer,
  orpcRouter: typeof router,
  client: RouterClient<typeof router>,
  baseUrl: string
) {
  traverseContractProcedures(
    { router: orpcRouter, path: [] },
    ({ contract, path }) => {
      const toolName = path.join("_");
      const prefix = path[0];

      if (!prefix || !INCLUDE_PREFIXES.has(prefix)) return;

      const def = (contract as any)["~orpc"];
      const inputSchema = def.inputSchema ?? undefined;

      const description =
        DESCRIPTIONS[toolName] ??
        def.route?.description ??
        `${path.join(".")} procedure`;

      server.registerTool(
        toolName,
        {
          description,
          ...(inputSchema ? { inputSchema } : {}),
        },
        async (args: any) => {
          // Walk the client object tree to reach the procedure function
          const clientFn = path.reduce(
            (acc: any, key: string) => acc[key],
            client
          ) as (input: unknown) => Promise<unknown>;

          const result = await clientFn(args ?? {});

          const postProcess = POST_PROCESSORS[toolName];
          const text = postProcess
            ? postProcess(result, baseUrl)
            : JSON.stringify(result, null, 2);

          return {
            content: [{ type: "text" as const, text }],
          };
        }
      );
    }
  );
}
