import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RouterClient } from "@orpc/server";

import { traverseContractProcedures } from "@orpc/server";

import type { router } from "../../lib/procedures";

/** Streaming procedures — not compatible with MCP's single-response model */
const EXCLUDE = new Set(["chat", "rootChat"]);

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

  // Messages
  messages_send: "Send a message to another Claude session or project",
  messages_list: "List messages for a project/session",
  messages_markRead: "Mark a message as read",
  messages_unreadBySession:
    "Get unread message counts by session for a project",

  // Projects
  projects_list:
    "List all Claude Code projects with metadata (slug, path, last active, git remote, costs)",
  projects_resolveSlug: "Resolve a project slug to its filesystem path",
  projects_config:
    "Get project configuration (MCP servers, CLAUDE.md, agents, skills)",
  projects_files: "List files and directories in a project",
  projects_readFile: "Read file content from a project",
  projects_createDir: "Create a directory inside a project",
  projects_create:
    "Create a new project directory and optionally run an initial prompt",

  // Sessions
  sessions_list: "List sessions for a specific project",
  sessions_messages: "Get messages from a specific session",
  sessions_recent: "List recently active sessions across all projects",

  // Favorites
  favorites_get: "Get favorited projects and sessions",
  favorites_toggleProject: "Toggle a project as favorite",
  favorites_toggleSession: "Toggle a session as favorite",

  // User
  user_config: "Get user-level configuration (MCP servers, skills)",

  // Tmux
  tmux_panes: "List active tmux panes",

  // Server
  server_config: "Get server configuration (SSH host, home directory)",

  // Analytics
  analytics_globalStats: "Get global usage statistics",
  analytics_activity: "Get daily activity data",
  analytics_facets: "Get session facets for given session IDs",

  // Integrations
  integrations_list:
    "List all configured integrations (Linear, GitHub, Railway)",
  integrations_create: "Create a new integration connection",
  integrations_delete: "Delete an integration by ID",
  integrations_toggle: "Enable or disable an integration",
  integrations_data: "Fetch dashboard widget data for an integration",
  integrations_test: "Test an integration connection with a token",
  integrations_suggest:
    "Suggest integrations based on project MCP servers and git remote",

  // API Keys
  apiKeys_list: "List all stored API keys (tokens redacted)",
  apiKeys_create: "Store a new API key in the vault",
  apiKeys_update: "Update an API key label or token",
  apiKeys_delete: "Delete an API key from the vault",
  apiKeys_test: "Test an API key by connecting to its provider",
  apiKeys_usage: "Get usage counts for API keys across integrations",

  // Root workspace
  root_primarySession: "Get the root workspace primary session ID",
  root_setPrimary: "Set the root workspace primary session ID",
  root_sessions: "List root workspace sessions",
  root_messages: "Get messages from a root workspace session",

  // Email
  email_getConfig: "Get email configuration for a workspace",
  email_setConfig:
    "Configure email address and inbound behavior for a workspace",
  email_removeConfig: "Remove email configuration for a workspace",
  email_send:
    "Send an email. Supports replies with threading via inReplyTo parameter.",
  email_events: "List recent email events (sent and received)",
  email_listConfigs: "List all configured email addresses across workspaces",
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

      if (EXCLUDE.has(toolName)) return;

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
