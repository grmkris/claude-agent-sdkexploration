import { Octokit } from "@octokit/rest";

import type { IntegrationProvider } from "../integration-providers";
import type { IntegrationConfig, IntegrationWidget } from "../types";

function parseRepo(
  config?: Record<string, unknown>
): { owner: string; repo: string } | null {
  const url = config?.gitRemoteUrl as string | undefined;
  if (!url) return null;
  const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export class GitHubProvider implements IntegrationProvider {
  type = "github";

  async testConnection(token: string, config?: Record<string, unknown>) {
    try {
      if (token) {
        const octokit = new Octokit({ auth: token });
        const { data: user } = await octokit.rest.users.getAuthenticated();
        return { ok: true, meta: { userName: user.login } };
      }
      // Public repo test (no token)
      const parsed = parseRepo(config);
      if (parsed) {
        const octokit = new Octokit();
        await octokit.rest.repos.get({
          owner: parsed.owner,
          repo: parsed.repo,
        });
        return { ok: true, meta: { userName: "(public)" } };
      }
      return { ok: false, error: "No token or repo URL provided" };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Connection failed",
      };
    }
  }

  async fetchWidgets(
    integration: IntegrationConfig
  ): Promise<IntegrationWidget[]> {
    const token = integration.auth.token || undefined;
    const parsed = parseRepo(integration.config);
    if (!parsed) return [];

    const { owner, repo } = parsed;
    const octokit = token ? new Octokit({ auth: token }) : new Octokit();
    const widgets: IntegrationWidget[] = [];

    // Open PRs
    try {
      const { data: prs } = await octokit.rest.pulls.list({
        owner,
        repo,
        state: "open",
        per_page: 10,
        sort: "updated",
      });
      const items = prs.map((pr) => ({
        id: String(pr.number),
        title: `#${pr.number} ${pr.title}`,
        subtitle: pr.user?.login,
        status: pr.draft ? "Draft" : "Open",
        statusColor: pr.draft ? "#6b7280" : "#22c55e",
        url: pr.html_url,
        timestamp: pr.updated_at,
      }));
      widgets.push({
        id: "github-prs",
        title: "Open PRs",
        type: "list",
        items,
      });
    } catch {
      /* skip widget on error */
    }

    // Recent commits on default branch
    try {
      const { data: commits } = await octokit.rest.repos.listCommits({
        owner,
        repo,
        per_page: 10,
      });
      const items = commits.map((c) => ({
        id: c.sha.slice(0, 7),
        title: c.commit.message.split("\n")[0],
        subtitle: c.commit.author?.name,
        url: c.html_url,
        timestamp: c.commit.author?.date,
      }));
      widgets.push({
        id: "github-commits",
        title: "Recent Commits",
        type: "list",
        items,
      });
    } catch {
      /* skip widget on error */
    }

    return widgets;
  }
}
