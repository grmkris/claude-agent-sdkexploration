"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useRailwayDeployments,
  type ParsedDeployment,
} from "@/hooks/use-railway-deployments";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  SUCCESS: "Live",
  DEPLOYING: "Deploying",
  BUILDING: "Building",
  FAILED: "Failed",
  CRASHED: "Crashed",
  REMOVED: "Removed",
};

function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function DeployRow({ deploy }: { deploy: ParsedDeployment }) {
  const isFailed = deploy.derivedStatus === "failed";
  const isActive = deploy.derivedStatus === "active";

  return (
    <div className="flex items-center gap-2 py-1 text-xs">
      {/* Status dot */}
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          isActive && "bg-yellow-400 animate-pulse",
          isFailed && "bg-red-400"
        )}
      />

      {/* Service name */}
      <span className="flex-1 truncate font-medium text-foreground">
        {deploy.serviceName}
      </span>

      {/* Status badge */}
      <span
        className={cn(
          "shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded",
          isActive && "bg-yellow-500/10 text-yellow-400",
          isFailed && "bg-red-500/10 text-red-400"
        )}
      >
        {STATUS_LABEL[deploy.status] ?? deploy.status}
      </span>
    </div>
  );
}

export function RailwayDeploymentStatus({ slug }: { slug: string }) {
  const { activeDeployments, failedDeployments, hasRailway } =
    useRailwayDeployments(slug);

  // Don't render if no Railway integration or nothing noteworthy
  if (!hasRailway) return null;
  if (activeDeployments.length === 0 && failedDeployments.length === 0)
    return null;

  return (
    <div className="mx-2 mb-1 rounded-md border border-border/50 bg-muted/30">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1.5">
        {/* Railway icon */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
        >
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        </svg>
        <span className="text-[11px] font-medium text-muted-foreground">
          Deployments
        </span>
      </div>

      {/* Active builds */}
      {activeDeployments.length > 0 && (
        <div className="px-2.5 pb-1">
          {activeDeployments.map((d) => (
            <Tooltip key={d.id}>
              <TooltipTrigger
                render={
                  <a
                    href={d.dashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-sm hover:bg-muted/50 transition-colors px-0.5 -mx-0.5"
                  />
                }
              >
                <DeployRow deploy={d} />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="font-medium">{d.serviceName}</p>
                {d.commitMessage && (
                  <p className="text-muted-foreground mt-0.5 whitespace-pre-wrap">
                    {d.commitMessage}
                  </p>
                )}
                <p className="text-muted-foreground mt-0.5">
                  Started {relativeTime(d.createdAt)}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}

      {/* Failed deployments */}
      {failedDeployments.length > 0 && (
        <div className="px-2.5 pb-2">
          {failedDeployments.map((d) => (
            <Tooltip key={d.id}>
              <TooltipTrigger
                render={
                  <a
                    href={d.dashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-sm hover:bg-muted/50 transition-colors px-0.5 -mx-0.5"
                  />
                }
              >
                <DeployRow deploy={d} />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="font-medium">{d.serviceName}</p>
                {d.commitMessage && (
                  <p className="text-muted-foreground mt-0.5 whitespace-pre-wrap">
                    {d.commitMessage}
                  </p>
                )}
                <p className="text-muted-foreground mt-0.5">
                  Failed {relativeTime(d.createdAt)}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}
