import type { CommitRaw, DeploymentRaw, TicketRaw } from "./activity-types";

const PRIORITY_LABEL: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

/** Truncates a string to a max length, appending "..." if truncated. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}

/**
 * Builds a rich contextual prompt string for a git commit.
 * Follows the email/webhook executor pattern: structured sections
 * with concrete suggestions for what the agent can do.
 */
export function buildCommitContextPrompt(raw: CommitRaw): string {
  const lines: string[] = [
    "[Activity Context: Git Commit]",
    "",
    `Commit: ${raw.shortHash} (full: ${raw.hash})`,
    `Author: ${raw.author}`,
    `Date: ${raw.date}`,
  ];

  if (raw.branch) {
    lines.push(`Branch: ${raw.branch}`);
  }

  lines.push("", `Subject: ${raw.subject}`);

  if (raw.body?.trim()) {
    lines.push("", "Body:", raw.body.trim());
  }

  lines.push(
    "",
    "---",
    "",
    "I can help you with this commit. For example:",
    `- Run \`git show ${raw.shortHash}\` to inspect the full diff`,
    "- Review the changes for bugs or code quality issues",
    "- Write or update tests for the changes",
    "- Explain what this commit does in plain language",
    "",
    "What would you like to do?"
  );

  return lines.join("\n");
}

/**
 * Builds a rich contextual prompt string for a Railway deployment.
 */
export function buildDeploymentContextPrompt(raw: DeploymentRaw): string {
  const lines: string[] = [
    "[Activity Context: Railway Deployment]",
    "",
    `Service: ${raw.serviceName}`,
    `Status: ${raw.status}`,
    `Deployment ID: ${raw.id}`,
    `Created: ${raw.createdAt}`,
  ];

  if (raw.dashboardUrl) {
    lines.push(`Dashboard: ${raw.dashboardUrl}`);
  }

  if (raw.commitHash) {
    lines.push(
      `Commit: ${raw.commitMessage ? `${raw.commitMessage} (${raw.commitHash.slice(0, 7)})` : raw.commitHash.slice(0, 7)}`
    );
  }

  if (raw.githubUrl) {
    lines.push(`GitHub: ${raw.githubUrl}`);
  }

  const isFailed = ["FAILED", "CRASHED"].includes(raw.status);
  const isDeploying = ["DEPLOYING", "BUILDING"].includes(raw.status);

  lines.push("", "---", "");

  if (isFailed) {
    lines.push(
      "This deployment has failed. I can help you:",
      "- Investigate why this deployment failed",
      "- Check the Railway logs for error messages",
      "- Identify and fix the root cause",
      "- Suggest a fix and redeploy"
    );
  } else if (isDeploying) {
    lines.push(
      "This deployment is currently in progress. I can help you:",
      "- Monitor the deployment status",
      "- Review recent changes that are being deployed",
      "- Prepare a rollback if the deployment fails"
    );
  } else {
    lines.push(
      "I can help you with this deployment. For example:",
      "- Review what was deployed in this release",
      "- Check if there are any issues with the running service",
      "- Compare this deployment with a previous one"
    );
  }

  lines.push("", "What would you like to do?");

  return lines.join("\n");
}

/**
 * Builds a rich contextual prompt string for a Linear ticket.
 * Truncates description to ~500 chars to stay within URL param limits.
 */
export function buildTicketContextPrompt(raw: TicketRaw): string {
  const lines: string[] = [
    "[Activity Context: Linear Issue]",
    "",
    `Issue: ${raw.identifier} — ${raw.title}`,
    `Status: ${raw.status}`,
  ];

  if (raw.priority !== undefined) {
    lines.push(`Priority: ${PRIORITY_LABEL[raw.priority] ?? String(raw.priority)}`);
  }

  if (raw.assignee) {
    lines.push(`Assignee: ${raw.assignee}`);
  }

  lines.push(`URL: ${raw.url}`);

  if (raw.description?.trim()) {
    const desc = truncate(raw.description.trim(), 500);
    lines.push("", "Description:", desc);
  }

  lines.push(
    "",
    "---",
    "",
    "I can help you with this issue. For example:",
    "- Start implementing this feature or fix",
    "- Break it down into smaller subtasks",
    "- Write a technical design or approach",
    "- Create tests for the requirements",
    "- Summarise what needs to be done",
    "",
    "What would you like to do?"
  );

  return lines.join("\n");
}
