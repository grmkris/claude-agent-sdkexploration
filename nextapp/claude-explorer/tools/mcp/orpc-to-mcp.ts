import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RouterClient } from "@orpc/server";

import { traverseContractProcedures } from "@orpc/server";

import type { router } from "../../lib/procedures";

/** Only expose these top-level router keys as MCP tools (keeps agent context small) */
const INCLUDE_PREFIXES = new Set(["crons", "webhooks", "email", "projects"]);

/** Specific tool names (flattened path) to exclude even if their prefix is included */
const EXCLUDE_TOOLS = new Set([
  "projects_gitStatus",
  "projects_gitLog",
  "projects_gitDiff",
  "projects_gitPull",
  "projects_gitStageAll",
  "projects_gitCommitFiles",
  "projects_gitCommitDiff",
  "projects_gitWorktrees",
]);

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

  // Projects
  projects_list: "List all projects",
  projects_create:
    "Create a new project directory. Provide parentDir (e.g. /home/bun/projects), name, and an optional initialPrompt to auto-send when the chat opens.",
  projects_resolveSlug: "Resolve a project slug to its filesystem path",
  projects_config: "Get project MCP and skill configuration",
  projects_files: "List files and directories inside a project",
  projects_readFile: "Read the contents of a file inside a project",
  projects_createDir: "Create a subdirectory inside a project",
  projects_getEnv: "Get project-level environment variables",
  projects_setEnv: "Set project-level environment variables",

  // Email
  email_getConfig: "Get email configuration for a workspace",
  email_setConfig:
    "Configure email address and inbound behavior for a workspace",
  email_removeConfig: "Remove email configuration for a workspace",
  email_send:
    "Send an email. Supports replies with threading via inReplyTo parameter.",
  email_events: "List recent email events (sent and received)",
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
  projects_create: (result, baseUrl) => {
    const p = result as { slug: string; path: string };
    const chatUrl = `${baseUrl}/project/${p.slug}/chat?_new=${Date.now()}`;
    return `Created project at ${p.path}\nOpen in chat: ${chatUrl}\n\n${JSON.stringify(result, null, 2)}`;
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
      if (EXCLUDE_TOOLS.has(toolName)) return;

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
