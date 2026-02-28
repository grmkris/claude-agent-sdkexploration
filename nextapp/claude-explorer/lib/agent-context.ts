/**
 * agent-context.ts — Builds environment context for spawned agents.
 *
 * Every agent receives a context block appended to the system prompt so it
 * knows its working directory, git branch, connected Railway project/service,
 * Linear team, GitHub repo, and which integrations are available.
 */

import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { IntegrationConfig } from "./schemas";

import { getIntegrations } from "./explorer-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RailwayState {
  projectId?: string;
  projectName?: string;
  serviceId?: string;
  serviceName?: string;
  environmentId?: string;
  environmentName?: string;
}

export interface LinearState {
  teamId?: string;
  teamName?: string;
  userName?: string;
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
// Railway state detection (disk + integration config)
// ---------------------------------------------------------------------------

/**
 * Read Railway link state from the `.railway/` config on disk.
 * The Railway CLI stores a JSON config file here when `railway link` is used.
 */
async function detectRailwayFromDisk(
  cwd: string
): Promise<RailwayState | null> {
  try {
    // Railway CLI stores config in .railway/config.json
    const configPath = join(cwd, ".railway", "config.json");
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;
    const project = config.project as Record<string, unknown> | undefined;
    const environment = config.environment as
      | Record<string, unknown>
      | undefined;

    if (!project?.id) return null;

    return {
      projectId: project.id as string,
      projectName: project.name as string | undefined,
      serviceId: (config.service as Record<string, unknown>)?.id as
        | string
        | undefined,
      serviceName: (config.service as Record<string, unknown>)?.name as
        | string
        | undefined,
      environmentId: environment?.id as string | undefined,
      environmentName: environment?.name as string | undefined,
    };
  } catch {
    // No .railway/ config — try older format or just return null
  }

  // Also try the older Railway config format (project-level .railway.json)
  try {
    const configPath = join(cwd, ".railway.json");
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;
    if (config.projectId) {
      return { projectId: config.projectId as string };
    }
  } catch {
    // No config found
  }

  return null;
}

/**
 * Read Railway state from explorer integration configs.
 */
async function detectRailwayFromIntegration(
  projectSlug?: string
): Promise<RailwayState | null> {
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
 * Detect Railway state from both disk and integration config.
 * Disk takes priority (more accurate for CLI-linked projects).
 */
export async function detectRailwayState(
  cwd?: string,
  projectSlug?: string
): Promise<RailwayState | null> {
  // 1. Try disk first (most accurate)
  if (cwd) {
    const fromDisk = await detectRailwayFromDisk(cwd);
    if (fromDisk) return fromDisk;
  }

  // 2. Fall back to integration config
  return detectRailwayFromIntegration(projectSlug);
}

// ---------------------------------------------------------------------------
// Linear state detection
// ---------------------------------------------------------------------------

export async function detectLinearState(
  projectSlug?: string
): Promise<LinearState | null> {
  if (!projectSlug) return null;
  try {
    const integrations = await getIntegrations();
    const linear = integrations.find(
      (i: IntegrationConfig) =>
        i.type === "linear" && i.projectSlug === projectSlug && i.enabled
    );
    if (!linear) return null;

    return {
      teamId: linear.config?.teamId as string | undefined,
      userName: linear.config?.userName as string | undefined,
    };
  } catch {
    return null;
  }
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

  // Railway state
  const railway = await detectRailwayState(opts.cwd, opts.projectSlug);
  if (railway) {
    const parts = [
      `Railway project: ${railway.projectName ?? railway.projectId}`,
    ];
    if (railway.serviceName || railway.serviceId) {
      parts.push(
        `Railway service: ${railway.serviceName ?? railway.serviceId}`
      );
    }
    if (railway.environmentName || railway.environmentId) {
      parts.push(
        `Railway environment: ${railway.environmentName ?? railway.environmentId}`
      );
    }
    lines.push(...parts);
  }

  // Linear state
  const linear = await detectLinearState(opts.projectSlug);
  if (linear) {
    if (linear.teamId) {
      lines.push(`Linear team ID: ${linear.teamId}`);
    }
    if (linear.userName) {
      lines.push(`Linear bot user: ${linear.userName}`);
    }
  }

  // GitHub state
  const github = await detectGithubState(opts.projectSlug, opts.cwd);
  if (github?.owner && github.repo) {
    lines.push(`GitHub repo: ${github.owner}/${github.repo}`);
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
