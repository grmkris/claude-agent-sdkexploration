import { LinearClient } from "@linear/sdk";

import type { IntegrationProvider } from "../integration-providers";
import type { IntegrationConfig, IntegrationWidget } from "../types";

export class LinearProvider implements IntegrationProvider {
  type = "linear";

  async testConnection(token: string) {
    try {
      const client = new LinearClient({ accessToken: token });
      const viewer = await client.viewer;
      const teams = await client.teams();
      return {
        ok: true,
        meta: {
          userName: viewer.name,
          teams: teams.nodes.map((t) => ({ id: t.id, name: t.name })),
        },
      };
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
    const client = new LinearClient({ accessToken: integration.auth.token });
    const teamId = integration.config?.teamId as string | undefined;
    const userName = integration.config?.userName as string | undefined;
    const widgets: IntegrationWidget[] = [];

    // My assigned open issues (filtered by userName if using bot token)
    try {
      let assigned;
      if (userName) {
        // Bot token: filter by user name instead of viewer (which is the bot)
        const users = await client.users({ filter: { name: { eq: userName } } });
        const user = users.nodes[0];
        if (user) {
          assigned = await user.assignedIssues({
            filter: {
              state: { type: { in: ["backlog", "unstarted", "started"] } },
              ...(teamId ? { team: { id: { eq: teamId } } } : {}),
            },
            first: 15,
            orderBy: "updatedAt" as any,
          });
        }
      }
      if (!assigned) {
        const viewer = await client.viewer;
        assigned = await viewer.assignedIssues({
          filter: {
            state: { type: { in: ["backlog", "unstarted", "started"] } },
            ...(teamId ? { team: { id: { eq: teamId } } } : {}),
          },
          first: 15,
          orderBy: "updatedAt" as any,
        });
      }
      const items = await Promise.all(
        assigned.nodes.map(async (i) => {
          const state = await i.state;
          return {
            id: i.identifier,
            title: `${i.identifier} ${i.title}`,
            status: state?.name ?? "",
            statusColor: state?.color ?? "",
            url: i.url,
            timestamp: i.updatedAt?.toISOString(),
          };
        })
      );
      widgets.push({
        id: "linear-assigned",
        title: "My Issues",
        type: "list",
        items,
      });
    } catch {
      /* skip widget on error */
    }

    // Recent team activity
    try {
      const issues = await client.issues({
        filter: teamId ? { team: { id: { eq: teamId } } } : undefined,
        first: 10,
        orderBy: "updatedAt" as any,
      });
      const items = await Promise.all(
        issues.nodes.map(async (i) => {
          const state = await i.state;
          const assignee = await i.assignee;
          return {
            id: i.identifier,
            title: `${i.identifier} ${i.title}`,
            subtitle: assignee?.name,
            status: state?.name ?? "",
            statusColor: state?.color ?? "",
            url: i.url,
            timestamp: i.updatedAt?.toISOString(),
          };
        })
      );
      widgets.push({
        id: "linear-recent",
        title: "Recent Activity",
        type: "list",
        items,
      });
    } catch {
      /* skip widget on error */
    }

    return widgets;
  }
}
