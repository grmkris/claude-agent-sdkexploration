import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { DeploymentRaw } from "@/lib/activity-types";

import { orpc } from "@/lib/orpc";

export type DeploymentStatus = "active" | "failed" | "success" | "other";

export interface ParsedDeployment extends DeploymentRaw {
  derivedStatus: DeploymentStatus;
}

/**
 * Shared hook that fetches Railway deployment data for a project slug.
 * Uses React Query caching so multiple consumers share the same network request.
 */
export function useRailwayDeployments(slug: string | null) {
  // Find Railway integration for this project
  const { data: integrations } = useQuery({
    ...orpc.integrations.list.queryOptions(),
    staleTime: 60_000,
  });

  const railwayIntegration = useMemo(
    () =>
      integrations?.find(
        (i) => i.projectSlug === slug && i.type === "railway" && i.enabled
      ),
    [integrations, slug]
  );

  // Fetch Railway widget data — faster refetch (15s) to catch active builds
  const { data: railwayData, isLoading } = useQuery({
    ...orpc.integrations.data.queryOptions({
      input: { id: railwayIntegration?.id ?? "" },
    }),
    enabled: !!railwayIntegration,
    refetchInterval: 15_000,
    staleTime: 15_000,
  });

  // Build service URL map from railway-services widget
  const serviceUrlByName = useMemo(() => {
    const map = new Map<string, string>();
    const servicesWidget = railwayData?.widgets.find(
      (w) => w.id === "railway-services"
    );
    for (const svc of servicesWidget?.items ?? []) {
      if (svc.secondaryUrl) map.set(svc.title, svc.secondaryUrl);
    }
    return map;
  }, [railwayData]);

  // Parse deployments into typed objects
  const deployments = useMemo<ParsedDeployment[]>(() => {
    const deploysWidget = railwayData?.widgets.find(
      (w) => w.id === "railway-deploys"
    );
    if (!deploysWidget) return [];

    return deploysWidget.items.map((item) => {
      const status = item.status ?? "UNKNOWN";
      let derivedStatus: DeploymentStatus;
      if (status === "DEPLOYING" || status === "BUILDING") {
        derivedStatus = "active";
      } else if (status === "FAILED" || status === "CRASHED") {
        derivedStatus = "failed";
      } else if (status === "SUCCESS") {
        derivedStatus = "success";
      } else {
        derivedStatus = "other";
      }

      return {
        id: item.id,
        status,
        statusColor: item.statusColor ?? "#6b7280",
        serviceName: item.title,
        createdAt: item.timestamp ?? new Date().toISOString(),
        commitMessage: item.subtitle,
        commitHash: item.secondaryLabel
          ? item.secondaryUrl?.split("/").at(-1)
          : undefined,
        dashboardUrl: item.url,
        githubUrl: item.secondaryUrl,
        serviceUrl: serviceUrlByName.get(item.title),
        logsUrl: item.logsUrl,
        derivedStatus,
      };
    });
  }, [railwayData, serviceUrlByName]);

  // Convenience subsets
  const activeDeployments = useMemo(
    () => deployments.filter((d) => d.derivedStatus === "active"),
    [deployments]
  );

  const failedDeployments = useMemo(
    () => deployments.filter((d) => d.derivedStatus === "failed"),
    [deployments]
  );

  return {
    deployments,
    activeDeployments,
    failedDeployments,
    hasActive: activeDeployments.length > 0,
    hasFailed: failedDeployments.length > 0,
    hasRailway: !!railwayIntegration,
    isLoading,
  };
}
