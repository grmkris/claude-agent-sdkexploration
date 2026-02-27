"use client";

import type { CommitRaw, DeploymentRaw, TicketRaw } from "@/lib/activity-types";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CommitItemProps {
  raw: CommitRaw;
  onStartChat: () => void;
  onViewExternal?: () => void;
  relatedDeployments?: DeploymentRaw[];
  relatedTickets?: TicketRaw[];
}

export function CommitItem({
  raw,
  onStartChat,
  onViewExternal,
  relatedDeployments,
  relatedTickets,
}: CommitItemProps) {
  return (
    <div className="group border-b border-border/50 last:border-0">
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        {/* Icon */}
        <div className="mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/10 text-violet-400">
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
            <circle cx="12" cy="12" r="3" />
            <line x1="3" y1="12" x2="9" y2="12" />
            <line x1="15" y1="12" x2="21" y2="12" />
          </svg>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Hash badge with full hash tooltip */}
            <Tooltip>
              <TooltipTrigger>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded cursor-default">
                  {raw.shortHash}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                <span className="font-mono">{raw.hash}</span>
              </TooltipContent>
            </Tooltip>
            {raw.branch && (
              <span className="shrink-0 text-[10px] text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded font-medium">
                {raw.branch}
              </span>
            )}
          </div>

          {/* Subject with full message tooltip */}
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <span className="mt-0.5 text-xs text-foreground leading-snug line-clamp-2 cursor-default block">
                {raw.subject}
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-[320px] whitespace-pre-wrap break-words"
            >
              <span className="font-medium">{raw.subject}</span>
              {raw.body?.trim() && (
                <>
                  {"\n"}
                  <span className="opacity-70 whitespace-pre-wrap">
                    {raw.body.trim()}
                  </span>
                </>
              )}
            </TooltipContent>
          </Tooltip>

          {/* Correlation badges: deployments + tickets */}
          {((relatedDeployments && relatedDeployments.length > 0) ||
            (relatedTickets && relatedTickets.length > 0)) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {relatedDeployments?.map((dep) => {
                const isFailed =
                  dep.status === "FAILED" || dep.status === "CRASHED";
                const isLive = dep.status === "SUCCESS";
                const isBuilding =
                  dep.status === "DEPLOYING" || dep.status === "BUILDING";
                return (
                  <Tooltip key={dep.id}>
                    <TooltipTrigger>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] px-1 py-0.5 rounded font-medium cursor-default",
                          isFailed && "bg-red-500/10 text-red-400",
                          isLive && "bg-green-500/10 text-green-400",
                          isBuilding && "bg-yellow-500/10 text-yellow-400",
                          !isFailed &&
                            !isLive &&
                            !isBuilding &&
                            "bg-muted text-muted-foreground"
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full bg-current shrink-0",
                            isBuilding && "animate-pulse"
                          )}
                        />
                        {dep.serviceName}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      Deployed to {dep.serviceName}: {dep.status}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
              {relatedTickets?.map((ticket) => (
                <Tooltip key={ticket.identifier}>
                  <TooltipTrigger>
                    <span className="inline-flex items-center text-[10px] font-mono px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium cursor-default">
                      {ticket.identifier}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    {ticket.title}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}

          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {raw.author} · {relativeTime(raw.date)}
          </p>
        </div>

        {/* Hover actions */}
        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onViewExternal && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewExternal();
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="View on GitHub"
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
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartChat();
            }}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
            title="Start a chat about this commit"
          >
            ✦ Chat
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
