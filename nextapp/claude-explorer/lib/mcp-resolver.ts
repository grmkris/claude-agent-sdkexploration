/**
 * mcp-resolver.ts — Shared MCP server merging logic.
 *
 * Extracts the MCP resolution pattern that was duplicated across executors
 * (previously only the interactive chat executor merged project-level MCPs).
 * Now every executor (cron, webhook, email, linear chat) can resolve and
 * merge user/project/local MCP servers via a single call.
 */

import { join } from "node:path";

import {
  readUserMcpServers,
  readProjectMcpConfig,
  readLocalMcpServers,
} from "./claude-fs";
import { getMcpPreferences } from "./explorer-db";

export interface McpStdioConfig {
  type?: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Build the explorer MCP server config that gives agents access to Linear
 * tools, email, crons, webhooks, etc.
 */
export function buildExplorerMcpConfig(): {
  name: string;
  config: McpStdioConfig;
} {
  const explorerServerPath = join(process.cwd(), "tools", "explorer-server.ts");
  const baseUrl =
    process.env.EXPLORER_BASE_URL ??
    `http://localhost:${process.env.PORT ?? 41920}`;

  return {
    name: process.env.INSTANCE_NAME ?? "claude-explorer",
    config: {
      command: "bun",
      args: [explorerServerPath],
      env: {
        EXPLORER_BASE_URL: baseUrl,
        EXPLORER_RPC_URL: `${baseUrl}/rpc`,
        ...(process.env.RPC_INTERNAL_TOKEN
          ? { RPC_INTERNAL_TOKEN: process.env.RPC_INTERNAL_TOKEN }
          : {}),
      },
    },
  };
}

/**
 * Options controlling which optional MCPs to include.
 * When omitted, only "default" mode MCPs are included.
 */
export interface McpResolveOptions {
  /** Explicit set of optional MCPs the user enabled (scope:name pairs). */
  enabledOptionalMcps?: Array<{ scope: string; name: string }>;
}

/**
 * Resolve all MCP servers for a project: explorer + user + project + local.
 * Applies preference filtering (default vs optional) same as the chat executor.
 *
 * Returns a Record suitable for passing as `mcpServers` to query().
 */
export async function resolveAllMcpServers(
  cwd?: string,
  opts?: McpResolveOptions
): Promise<Record<string, unknown>> {
  const explorer = buildExplorerMcpConfig();
  const servers: Record<string, unknown> = {
    [explorer.name]: explorer.config,
  };

  try {
    const userMcps = await readUserMcpServers();
    const projectMcps = cwd ? ((await readProjectMcpConfig(cwd)) ?? {}) : {};
    const localMcps = cwd ? await readLocalMcpServers(cwd) : {};

    // Build set of selected optional MCPs
    const enabledOptionalSet = new Set<string>();
    if (opts?.enabledOptionalMcps) {
      for (const m of opts.enabledOptionalMcps) {
        enabledOptionalSet.add(`${m.scope}:${m.name}`);
      }
    }

    // Get preferences from DB
    const prefs = getMcpPreferences(cwd ?? undefined);
    const prefMap = new Map(
      prefs.map((p) => [`${p.scope}:${p.server_name}`, p.mode])
    );

    function shouldInclude(name: string, scope: string): boolean {
      if (name === explorer.name) return false; // already included
      const mode = prefMap.get(`${scope}:${name}`) ?? "default";
      if (mode === "default") return true;
      return enabledOptionalSet.has(`${scope}:${name}`);
    }

    for (const [name, config] of Object.entries(userMcps)) {
      if (shouldInclude(name, "user")) servers[name] = config;
    }
    for (const [name, config] of Object.entries(projectMcps)) {
      if (shouldInclude(name, "project")) servers[name] = config;
    }
    for (const [name, config] of Object.entries(localMcps)) {
      if (shouldInclude(name, "local")) servers[name] = config;
    }
  } catch {
    // best-effort — if reading disk configs fails, just use the explorer MCP
    console.warn("[mcp-resolver] Failed to read MCP configs from disk");
  }

  return servers;
}
