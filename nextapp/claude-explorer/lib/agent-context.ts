/**
 * agent-context.ts — Builds environment context for spawned agents.
 *
 * Every agent receives a context block appended to the system prompt so it
 * knows its working directory, git branch, which Railway project/service/
 * environment is currently linked, which GitHub repo it's in, and what
 * integrations are available.
 *
 * Design principles:
 *   - Only state facts about what's actually linked/configured right now
 *   - Mention that there may be other services/environments the agent can
 *     discover via tools (Railway projects often have multiple services)
 *   - Don't fabricate connections — if there's no integration, don't mention it
 *   - Railway CLI stores link state globally in ~/.railway/config.json, not in
 *     per-project .railway/ directories
 */

import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { IntegrationConfig } from "./schemas";

import { getIntegrations } from "./explorer-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RailwayLinkState {
  projectId: string;
  projectName?: string;
  /** Currently linked service UUID (null if no service linked). */
  serviceId?: string | null;
  /** Currently linked environment UUID. */
  environmentId?: string;
  /** Currently linked environment name (e.g. "production"). */
  environmentName?: string;
}

export interface GithubState {
  owner?: string;
  repo?: string;
  remoteUrl?: string;
}

export interface AgentContextOptions {
  /** Filesystem working directory for the agent. */
  cwd?: string;
  /** Explorer project slug (used to look up integrations). */
  projectSlug?: string;
  /** Which executor is spawning the agent. */
  source: string;
  /** Extra lines to append (e.g. executor-specific instructions). */
  extraContext?: string;
}

// ---------------------------------------------------------------------------
// Git detection
// ---------------------------------------------------------------------------

function detectGitBranch(cwd?: string): string | null {
  if (!cwd) return null;
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      timeout: 2000,
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function detectGitRemote(cwd?: string): string | null {
  if (!cwd) return null;
  try {
    return execSync("git config --get remote.origin.url", {
      cwd,
      timeout: 2000,
      stdio: ["pipe", "pipe", "pipe"],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Railway state detection
// ---------------------------------------------------------------------------

interface RailwayGlobalConfig {
  projects?: Record<
    string,
    {
      projectPath: string;
      name: string;
      project: string; // UUID
      environment: string; // UUID
      environmentName: string;
      service: string | null; // UUID or null
    }
  >;
}

/**
 * Read Railway link state from the global ~/.railway/config.json.
 *
 * The Railway CLI stores ALL link state in a single global config file,
 * keyed by directory path. Each entry maps a directory to exactly one
 * project + one environment + at most one service.
 *
 * The CLI walks up the directory tree to find the most specific match,
 * so we do the same here.
 */
async function detectRailwayFromCli(
  cwd: string
): Promise<RailwayLinkState | null> {
  try {
    const railwayDir =
      process.env.RAILWAY_CONFIG_DIR ?? join(homedir(), ".railway");
    const configPath = join(railwayDir, "config.json");
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as RailwayGlobalConfig;

    if (!config.projects) return null;

    // Walk up the directory tree to find the most specific match,
    // same as the Railway CLI does.
    let dir = cwd;
    while (true) {
      const entry = config.projects[dir];
      if (entry) {
        return {
          projectId: entry.project,
          projectName: entry.name || undefined,
          serviceId: entry.service,
          environmentId: entry.environment,
          environmentName: entry.environmentName || undefined,
        };
      }
      const parent = join(dir, "..");
      if (parent === dir) break; // reached root
      dir = parent;
    }
  } catch {
    // No Railway CLI config or parse error
  }
  return null;
}

/**
 * Read Railway project ID from explorer integration configs.
 * This is a fallback when the CLI config doesn't have a link for this directory.
 */
async function detectRailwayFromIntegration(
  projectSlug?: string
): Promise<RailwayLinkState | null> {
  if (!projectSlug) return null;
  try {
    const integrations = await getIntegrations();
    const railway = integrations.find(
      (i: IntegrationConfig) =>
        i.type === "railway" && i.projectSlug === projectSlug && i.enabled
    );
    if (!railway?.config?.railwayProjectId) return null;

    return {
      projectId: railway.config.railwayProjectId as string,
      projectName: railway.name || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Detect Railway state from CLI config first, then integration config.
 * CLI config is more accurate (has service + environment link state).
 */
export async function detectRailwayState(
  cwd?: string,
  projectSlug?: string
): Promise<RailwayLinkState | null> {
  if (cwd) {
    const fromCli = await detectRailwayFromCli(cwd);
    if (fromCli) return fromCli;
  }
  return detectRailwayFromIntegration(projectSlug);
}

// ---------------------------------------------------------------------------
// GitHub state detection
// ---------------------------------------------------------------------------

export async function detectGithubState(
  projectSlug?: string,
  cwd?: string
): Promise<GithubState | null> {
  // 1. Try integration config
  if (projectSlug) {
    try {
      const integrations = await getIntegrations();
      const github = integrations.find(
        (i: IntegrationConfig) =>
          i.type === "github" && i.projectSlug === projectSlug && i.enabled
      );
      if (github?.config?.gitRemoteUrl) {
        const url = github.config.gitRemoteUrl as string;
        const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
        if (match) {
          return { owner: match[1], repo: match[2], remoteUrl: url };
        }
      }
    } catch {
      // best-effort
    }
  }

  // 2. Try git remote from disk
  const remoteUrl = detectGitRemote(cwd);
  if (remoteUrl) {
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (match) {
      return { owner: match[1], repo: match[2], remoteUrl };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Integration summary
// ---------------------------------------------------------------------------

/**
 * List which integrations are enabled for this project (just types, no secrets).
 */
async function detectEnabledIntegrations(
  projectSlug?: string
): Promise<string[]> {
  if (!projectSlug) return [];
  try {
    const integrations = await getIntegrations();
    return integrations
      .filter(
        (i: IntegrationConfig) => i.projectSlug === projectSlug && i.enabled
      )
      .map((i: IntegrationConfig) => i.type);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main context builder
// ---------------------------------------------------------------------------

/**
 * Build an environment context string to append to the agent's system prompt.
 *
 * This tells the agent where it is, what it's connected to, and what
 * integrations are available — eliminating the "confused agent" problem.
 */
export async function buildAgentContext(
  opts: AgentContextOptions
): Promise<string> {
  const lines: string[] = ["## Environment Context", ""];

  // Working directory
  if (opts.cwd) {
    lines.push(`Working directory: ${opts.cwd}`);
  }

  // Git info
  const branch = detectGitBranch(opts.cwd);
  if (branch) {
    lines.push(`Git branch: ${branch}`);
  }

  // Railway link state
  const railway = await detectRailwayState(opts.cwd, opts.projectSlug);
  if (railway) {
    lines.push("");
    lines.push(`Railway project: ${railway.projectName ?? railway.projectId}`);
    if (railway.environmentName) {
      lines.push(`Railway linked environment: ${railway.environmentName}`);
    }
    if (railway.serviceId) {
      // Service name is not stored in Railway CLI config — just the UUID.
      // The agent can discover the name via the list-services MCP tool.
      lines.push(
        `Railway linked service: ${railway.serviceId} (use list-services to see all services and their names)`
      );
    } else {
      lines.push(
        `Railway linked service: none (use link-service to link one, or list-services to see available services)`
      );
    }
    lines.push(
      `Note: This project may have multiple services and environments. Use Railway MCP tools (list-services, link-service, link-environment) to explore and switch.`
    );
  }

  // GitHub repo
  const github = await detectGithubState(opts.projectSlug, opts.cwd);
  if (github?.owner && github.repo) {
    lines.push(`GitHub repo: ${github.owner}/${github.repo}`);
  }

  // Enabled integrations summary
  const integrations = await detectEnabledIntegrations(opts.projectSlug);
  if (integrations.length > 0) {
    lines.push(`Enabled integrations: ${integrations.join(", ")}`);
  }

  // Agent source
  lines.push(`Agent source: ${opts.source}`);

  // Extra context
  if (opts.extraContext) {
    lines.push("", opts.extraContext);
  }

  // Only return content if we have meaningful context beyond the header
  if (lines.length <= 3) return ""; // just header + blank + source = not useful

  return lines.join("\n");
}
