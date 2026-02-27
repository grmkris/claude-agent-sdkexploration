"use client";

import type { CommitRaw, DeploymentRaw } from "@/lib/activity-types";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DeploymentItemProps {
  raw: DeploymentRaw;
  onStartChat: () => void;
  relatedCommit?: CommitRaw;
}

const STATUS_LABEL: Record<string, string> = {
  SUCCESS: "Success",
  DEPLOYING: "Deploying",
  BUILDING: "Building",
  FAILED: "Failed",
  CRASHED: "Crashed",
  REMOVED: "Removed",
};

export function DeploymentItem({ raw, onStartChat, relatedCommit }: DeploymentItemProps) {
  const isFailed = raw.status === "FAILED" || raw.status === "CRASHED";
  const isLive = raw.status === "SUCCESS";
  const isBuilding = raw.status === "DEPLOYING" || raw.status === "BUILDING";

  return (
    <div className="group border-b border-border/50 last:border-0">
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        {/* Icon */}
        <div
          className={cn(
            "mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-full",
            isFailed
              ? "bg-red-500/10 text-red-400"
              : isLive
                ? "bg-green-500/10 text-green-400"
                : "bg-yellow-500/10 text-yellow-400"
          )}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
          </svg>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-foreground truncate">
              {raw.serviceName}
            </span>
            {/* Status badge */}
            <span
              className={cn(
                "shrink-0 text-[10px] font-medium px-1 py-0.5 rounded",
                isFailed && "bg-red-500/10 text-red-400",
                isLive && "bg-green-500/10 text-green-400",
                isBuilding && "bg-yellow-500/10 text-yellow-400",
                !isFailed &&
                  !isLive &&
                  !isBuilding &&
                  "bg-muted text-muted-foreground"
              )}
              style={
                !isFailed && !isLive && !isBuilding
                  ? { color: raw.statusColor }
                  : undefined
              }
            >
              {isBuilding && (
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
              )}
              {STATUS_LABEL[raw.status] ?? raw.status}
            </span>
          </div>

          {/* Commit message with full-text tooltip */}
          {raw.commitMessage && (
            <Tooltip>
              <TooltipTrigger>
                <p className="mt-0.5 text-[10px] text-muted-foreground truncate cursor-default text-left">
                  {raw.commitHash && (
                    <span className="font-mono mr-1">
                      {raw.commitHash.slice(0, 7)}
                    </span>
                  )}
                  {raw.commitMessage}
                </p>
              </TooltipTrigger>
              <TooltipContent side="top" className="whitespace-pre-wrap max-w-sm">
                {raw.commitHash && (
                  <span className="font-mono opacity-70 block mb-0.5">
                    {raw.commitHash}
                  </span>
                )}
                {raw.commitMessage}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Correlated commit badge */}
          {relatedCommit && (
            <div className="mt-1">
              <Tooltip>
                <TooltipTrigger>
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1 py-0.5 rounded bg-violet-500/10 text-violet-400 font-medium cursor-default">
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="3" />
                      <line x1="3" y1="12" x2="9" y2="12" />
                      <line x1="15" y1="12" x2="21" y2="12" />
                    </svg>
                    {relatedCommit.shortHash}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap">
                  <span className="font-medium">{relatedCommit.subject}</span>
                  {relatedCommit.body?.trim() && (
                    <>
                      {"\n"}
                      <span className="opacity-70 whitespace-pre-wrap">
                        {relatedCommit.body.trim()}
                      </span>
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          )}

          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {relativeTime(raw.createdAt)}
          </p>
        </div>

        {/* Hover actions */}
        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {raw.dashboardUrl && (
            <a
              href={raw.dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="View on Railway"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartChat();
            }}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
              isFailed
                ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
            title="Start a chat about this deployment"
          >
            {isFailed ? "✦ Fix" : "✦ Chat"}
          </button>
        </div>
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
