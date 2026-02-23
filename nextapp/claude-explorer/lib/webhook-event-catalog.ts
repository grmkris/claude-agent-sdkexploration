import { LinearClient } from "@linear/sdk";
import { Octokit } from "@octokit/rest";

// --- Types ---

export interface WebhookEventDef {
  key: string;
  label: string;
  description?: string;
  category: string;
}

export interface WebhookProviderCatalog {
  events: WebhookEventDef[];
  promptTemplates: { label: string; prompt: string }[];
  verification: "hmac-sha256" | "none";
  setupInstructions(config: SetupConfig): string;
  dashboardUrl(config: SetupConfig): string;
}

export interface SetupConfig {
  webhookUrl: string;
  signingSecret?: string;
  // Railway
  railwayProjectId?: string;
  // GitHub
  owner?: string;
  repo?: string;
  // Linear
  teamId?: string;
}

// --- Railway ---

const railwayCatalog: WebhookProviderCatalog = {
  events: [
    // Deployments
    { key: "DEPLOY_STARTED", label: "Deploy Started", category: "Deployments" },
    {
      key: "DEPLOY_COMPLETED",
      label: "Deploy Completed",
      category: "Deployments",
    },
    { key: "DEPLOY_FAILED", label: "Deploy Failed", category: "Deployments" },
    { key: "DEPLOY_CRASHED", label: "Deploy Crashed", category: "Deployments" },
    { key: "DEPLOY_REMOVED", label: "Deploy Removed", category: "Deployments" },
    // Alerts
    {
      key: "VOLUME_USAGE_HIGH",
      label: "Volume Usage High",
      category: "Alerts",
    },
    { key: "CPU_USAGE_HIGH", label: "CPU Usage High", category: "Alerts" },
    {
      key: "MEMORY_USAGE_HIGH",
      label: "Memory Usage High",
      category: "Alerts",
    },
  ],
  promptTemplates: [
    {
      label: "Investigate failed deploy",
      prompt:
        "A Railway deployment has failed. Check the deployment logs and error details in the payload. Identify the root cause and suggest a fix.",
    },
    {
      label: "Report on crash",
      prompt:
        "A Railway service has crashed. Analyze the crash payload, check recent changes, and provide a summary of what happened and recommended next steps.",
    },
  ],
  verification: "none",
  setupInstructions(config) {
    const projectUrl = config.railwayProjectId
      ? `https://railway.com/project/${config.railwayProjectId}/settings/webhooks`
      : "https://railway.com → your project → Settings → Webhooks";
    return [
      "## Railway Webhook Setup",
      "",
      "1. Go to your Railway project webhook settings:",
      `   ${projectUrl}`,
      "",
      "2. Click **Add Webhook**",
      "",
      "3. Paste this URL:",
      `   \`${config.webhookUrl}\``,
      "",
      "4. Select the events you want to receive",
      "",
      "5. Click **Save**",
      "",
      "> Railway webhooks don't use a signing secret — the webhook URL contains a unique ID for authentication.",
    ].join("\n");
  },
  dashboardUrl(config) {
    return config.railwayProjectId
      ? `https://railway.com/project/${config.railwayProjectId}/settings/webhooks`
      : "https://railway.com";
  },
};

// --- Linear ---

const linearCatalog: WebhookProviderCatalog = {
  events: [
    // Issues
    { key: "Issue.create", label: "Issue Created", category: "Issues" },
    { key: "Issue.update", label: "Issue Updated", category: "Issues" },
    { key: "Issue.remove", label: "Issue Removed", category: "Issues" },
    // Comments
    { key: "Comment.create", label: "Comment Created", category: "Comments" },
    { key: "Comment.update", label: "Comment Updated", category: "Comments" },
    { key: "Comment.remove", label: "Comment Removed", category: "Comments" },
    // Projects
    { key: "Project.create", label: "Project Created", category: "Projects" },
    { key: "Project.update", label: "Project Updated", category: "Projects" },
    {
      key: "ProjectUpdate.create",
      label: "Project Update Posted",
      category: "Projects",
    },
    // Cycles
    { key: "Cycle.create", label: "Cycle Created", category: "Cycles" },
    { key: "Cycle.update", label: "Cycle Updated", category: "Cycles" },
    // Documents
    {
      key: "Document.create",
      label: "Document Created",
      category: "Documents",
    },
    {
      key: "Document.update",
      label: "Document Updated",
      category: "Documents",
    },
    // SLA
    { key: "IssueSLA.set", label: "SLA Set", category: "SLA" },
    { key: "IssueSLA.highRisk", label: "SLA High Risk", category: "SLA" },
    { key: "IssueSLA.breached", label: "SLA Breached", category: "SLA" },
  ],
  promptTemplates: [
    {
      label: "Triage new issues",
      prompt:
        "A new Linear issue has been created. Review the issue details, assess priority and impact, and suggest appropriate labels and assignee recommendations.",
    },
    {
      label: "Respond to SLA breach",
      prompt:
        "An SLA breach has been detected in Linear. Analyze the affected issue, check what's blocking resolution, and draft a summary of the situation with recommended actions.",
    },
  ],
  verification: "hmac-sha256",
  setupInstructions(config) {
    return [
      "## Linear Webhook Setup",
      "",
      "1. Go to Linear API settings:",
      "   https://linear.app/settings/api",
      "",
      "2. Scroll to **Webhooks** and click **New webhook**",
      "",
      "3. Paste this URL:",
      `   \`${config.webhookUrl}\``,
      "",
      config.signingSecret
        ? `4. Set the signing secret to: \`${config.signingSecret}\``
        : "4. Set a signing secret and paste it in the webhook config",
      "",
      "5. Select the resource types you want to receive",
      "",
      "6. Click **Create webhook**",
      "",
      "> Linear uses HMAC-SHA256 for signature verification. Failed deliveries are retried automatically.",
    ].join("\n");
  },
  dashboardUrl() {
    return "https://linear.app/settings/api";
  },
};

// --- GitHub ---

const githubCatalog: WebhookProviderCatalog = {
  events: [
    // Code
    { key: "push", label: "Push", category: "Code" },
    { key: "pull_request", label: "Pull Request", category: "Code" },
    { key: "pull_request_review", label: "PR Review", category: "Code" },
    // Issues
    { key: "issues", label: "Issues", category: "Issues" },
    { key: "issue_comment", label: "Issue Comment", category: "Issues" },
    // Deployments
    { key: "deployment", label: "Deployment", category: "Deployments" },
    {
      key: "deployment_status",
      label: "Deployment Status",
      category: "Deployments",
    },
    // Releases
    { key: "release", label: "Release", category: "Releases" },
    // CI/CD
    { key: "workflow_run", label: "Workflow Run", category: "CI/CD" },
    { key: "check_run", label: "Check Run", category: "CI/CD" },
    { key: "check_suite", label: "Check Suite", category: "CI/CD" },
    { key: "workflow_dispatch", label: "Workflow Dispatch", category: "CI/CD" },
    // Refs
    { key: "create", label: "Branch/Tag Created", category: "Refs" },
    { key: "delete", label: "Branch/Tag Deleted", category: "Refs" },
    // Repository
    { key: "star", label: "Star", category: "Repository" },
    { key: "fork", label: "Fork", category: "Repository" },
  ],
  promptTemplates: [
    {
      label: "Review new PRs",
      prompt:
        "A new pull request has been opened on GitHub. Review the PR details, check the changes described, and provide a brief code review summary with any concerns or suggestions.",
    },
    {
      label: "Investigate CI failure",
      prompt:
        "A GitHub CI workflow has failed. Analyze the workflow run details from the payload, identify which step failed, and suggest what might have caused the failure.",
    },
  ],
  verification: "hmac-sha256",
  setupInstructions(config) {
    const repoUrl =
      config.owner && config.repo
        ? `https://github.com/${config.owner}/${config.repo}/settings/hooks`
        : "https://github.com → your repo → Settings → Webhooks";
    return [
      "## GitHub Webhook Setup",
      "",
      "1. Go to your repository webhook settings:",
      `   ${repoUrl}`,
      "",
      "2. Click **Add webhook**",
      "",
      "3. Paste this Payload URL:",
      `   \`${config.webhookUrl}\``,
      "",
      "4. Set Content type to **application/json**",
      "",
      config.signingSecret
        ? `5. Set the Secret to: \`${config.signingSecret}\``
        : "5. Set a secret and paste it in the webhook config",
      "",
      "6. Select the events you want to receive",
      "",
      "7. Click **Add webhook**",
      "",
      "> GitHub uses HMAC-SHA256 for signature verification with the `x-hub-signature-256` header.",
    ].join("\n");
  },
  dashboardUrl(config) {
    return config.owner && config.repo
      ? `https://github.com/${config.owner}/${config.repo}/settings/hooks`
      : "https://github.com";
  },
};

// --- Registry ---

const catalogs: Record<string, WebhookProviderCatalog> = {
  railway: railwayCatalog,
  linear: linearCatalog,
  github: githubCatalog,
};

export function getCatalog(provider: string): WebhookProviderCatalog | null {
  return catalogs[provider] ?? null;
}

// --- Event key extraction (used for filtering in route handler) ---

export function extractEventKey(
  provider: string,
  body: Record<string, unknown>,
  headers: Headers
): string {
  switch (provider) {
    case "railway":
      return (body.type as string) ?? "";
    case "linear": {
      const linearEvent = headers.get("Linear-Event") ?? "";
      const action = (body.action as string) ?? "";
      return action ? `${linearEvent}.${action}` : linearEvent;
    }
    case "github":
      return headers.get("x-github-event") ?? "";
    default:
      return "";
  }
}

// --- Auto-creation ---

export async function autoCreateLinearWebhook(opts: {
  apiKey: string;
  webhookUrl: string;
  subscribedEvents: string[];
  teamId?: string;
  label?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const client = new LinearClient({ apiKey: opts.apiKey });

    // Map subscribed events to Linear resource types (e.g. "Issue.create" → "Issue")
    const resourceTypes = [
      ...new Set(
        opts.subscribedEvents.map((e) => e.split(".")[0]).filter(Boolean)
      ),
    ];

    await client.createWebhook({
      url: opts.webhookUrl,
      resourceTypes,
      ...(opts.teamId ? { teamId: opts.teamId } : {}),
      label: opts.label ?? "Claude Explorer",
      enabled: true,
    });
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to create Linear webhook",
    };
  }
}

export async function autoCreateGithubWebhook(opts: {
  token: string;
  owner: string;
  repo: string;
  webhookUrl: string;
  subscribedEvents: string[];
  secret?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const octokit = new Octokit({ auth: opts.token });

    await octokit.rest.repos.createWebhook({
      owner: opts.owner,
      repo: opts.repo,
      config: {
        url: opts.webhookUrl,
        content_type: "json",
        ...(opts.secret ? { secret: opts.secret } : {}),
      },
      events: opts.subscribedEvents,
      active: true,
    });
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to create GitHub webhook",
    };
  }
}
