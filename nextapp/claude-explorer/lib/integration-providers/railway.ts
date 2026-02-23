import { ClientError, GraphQLClient, gql } from "graphql-request";

import type { IntegrationProvider } from "../integration-providers";
import type { IntegrationConfig, IntegrationWidget } from "../types";

const API = "https://backboard.railway.com/graphql/v2";

function createClient(token: string) {
  return new GraphQLClient(API, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// --- Response types ---

interface MeResponse {
  me: { id: string; name: string };
  projects: { edges: { node: { id: string; name: string } }[] };
}

interface ProjectsOnlyResponse {
  projects: { edges: { node: { id: string; name: string } }[] };
}

interface ServicesResponse {
  project: {
    services: {
      edges: {
        node: {
          id: string;
          name: string;
          deployments: {
            edges: {
              node: { id: string; status: string; createdAt: string };
            }[];
          };
          serviceInstances: {
            edges: {
              node: {
                domains: {
                  serviceDomains: { domain: string }[];
                  customDomains: { domain: string }[];
                };
              };
            }[];
          };
        };
      }[];
    };
  };
}

interface DeploymentMeta {
  commitHash?: string;
  commitMessage?: string;
  commitAuthor?: string;
  repo?: string;
  branch?: string;
}

interface DeploymentsResponse {
  project: {
    deployments: {
      edges: {
        node: {
          id: string;
          status: string;
          createdAt: string;
          staticUrl: string | null;
          meta: DeploymentMeta | null;
          service: { id: string; name: string } | null;
        };
      }[];
    };
  };
}

// --- Queries ---

const ME_QUERY = gql`
  {
    me {
      id
      name
    }
    projects(first: 50) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`;

// Workspace tokens can't query `me`, so fall back to projects-only
const PROJECTS_QUERY = gql`
  {
    projects(first: 50) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`;

const SERVICES_QUERY = gql`
  query ($projectId: String!) {
    project(id: $projectId) {
      services(first: 20) {
        edges {
          node {
            id
            name
            deployments(first: 1) {
              edges {
                node {
                  id
                  status
                  createdAt
                }
              }
            }
            serviceInstances {
              edges {
                node {
                  domains {
                    serviceDomains {
                      domain
                    }
                    customDomains {
                      domain
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const DEPLOYS_QUERY = gql`
  query ($projectId: String!) {
    project(id: $projectId) {
      deployments(first: 5) {
        edges {
          node {
            id
            status
            createdAt
            staticUrl
            meta
            service {
              id
              name
            }
          }
        }
      }
    }
  }
`;

const DEPLOY_COLOR: Record<string, string> = {
  SUCCESS: "#22c55e",
  DEPLOYING: "#eab308",
  BUILDING: "#eab308",
  FAILED: "#ef4444",
  CRASHED: "#ef4444",
  REMOVED: "#6b7280",
};

export class RailwayProvider implements IntegrationProvider {
  type = "railway";

  async testConnection(token: string) {
    const client = createClient(token);

    // Try account token first (me + projects)
    try {
      const data = await client.request<MeResponse>(ME_QUERY);
      return {
        ok: true,
        meta: {
          userName: data.me.name,
          projects: data.projects.edges.map((e) => ({
            id: e.node.id,
            name: e.node.name,
          })),
        },
      };
    } catch {
      // me query fails for workspace tokens — fall back
    }

    // Fall back to workspace token (projects only, no me)
    try {
      const data = await client.request<ProjectsOnlyResponse>(PROJECTS_QUERY);
      return {
        ok: true,
        meta: {
          userName: "(workspace token)",
          projects: data.projects.edges.map((e) => ({
            id: e.node.id,
            name: e.node.name,
          })),
        },
      };
    } catch (e) {
      const msg =
        e instanceof ClientError
          ? (e.response.errors?.[0]?.message ?? "Connection failed")
          : e instanceof Error
            ? e.message
            : "Connection failed";
      return { ok: false, error: msg };
    }
  }

  async fetchWidgets(
    integration: IntegrationConfig
  ): Promise<IntegrationWidget[]> {
    const client = createClient(integration.auth.token);
    const projectId = integration.config?.railwayProjectId as
      | string
      | undefined;
    if (!projectId) return [];

    const widgets: IntegrationWidget[] = [];

    // Services with latest deploy status + domains
    try {
      const data = await client.request<ServicesResponse>(SERVICES_QUERY, {
        projectId,
      });
      const items = data.project.services.edges.map((e) => {
        const svc = e.node;
        const deploy = svc.deployments.edges[0]?.node;
        const status = deploy?.status ?? "NO_DEPLOY";

        // Get domain URL from serviceInstances
        const domains = svc.serviceInstances.edges[0]?.node?.domains;
        const domain =
          domains?.customDomains[0]?.domain ??
          domains?.serviceDomains[0]?.domain;
        const serviceUrl = domain ? `https://${domain}` : undefined;

        return {
          id: svc.id,
          title: svc.name,
          subtitle: domain,
          status,
          statusColor: DEPLOY_COLOR[status] ?? "#6b7280",
          url: `https://railway.com/project/${projectId}/service/${svc.id}`,
          secondaryUrl: serviceUrl,
          secondaryLabel: domain,
          copyValue: serviceUrl,
          timestamp: deploy?.createdAt,
        };
      });
      widgets.push({
        id: "railway-services",
        title: "Services",
        type: "list",
        items,
      });
    } catch {
      /* skip widget on error */
    }

    // Last 5 deployments with commit metadata
    try {
      const data = await client.request<DeploymentsResponse>(DEPLOYS_QUERY, {
        projectId,
      });
      const items = data.project.deployments.edges.map((e) => {
        const d = e.node;
        const meta = d.meta as DeploymentMeta | null;
        const shortHash = meta?.commitHash?.slice(0, 7);
        const commitMsg = meta?.commitMessage?.split("\n")[0];

        // Primary URL → Railway dashboard service page
        const serviceId = d.service?.id;
        const dashboardUrl = serviceId
          ? `https://railway.com/project/${projectId}/service/${serviceId}`
          : undefined;

        // Secondary URL → GitHub commit link when available
        let secondaryUrl: string | undefined;
        let secondaryLabel: string | undefined;
        if (meta?.repo && meta?.commitHash) {
          secondaryUrl = `https://github.com/${meta.repo}/commit/${meta.commitHash}`;
          secondaryLabel = shortHash;
        }

        return {
          id: d.id,
          title: d.service?.name ?? "Deploy",
          subtitle: commitMsg,
          status: d.status,
          statusColor: DEPLOY_COLOR[d.status] ?? "#6b7280",
          url: dashboardUrl,
          secondaryUrl,
          secondaryLabel,
          timestamp: d.createdAt,
        };
      });
      widgets.push({
        id: "railway-deploys",
        title: "Recent Deploys",
        type: "list",
        items,
      });
    } catch {
      /* skip widget on error */
    }

    return widgets;
  }
}
