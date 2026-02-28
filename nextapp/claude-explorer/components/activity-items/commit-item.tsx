"use client";

import type { CommitFile } from "@/hooks/use-commit-expand";
import type { CommitRaw, DeploymentRaw, TicketRaw } from "@/lib/activity-types";

import { DiffView } from "@/components/diff-view";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CommitItemProps {
  raw: CommitRaw;
  slug: string;
  compact?: boolean;
  onStartChat: () => void;
  onViewExternal?: () => void;
  relatedDeployments?: DeploymentRaw[];
  relatedTickets?: TicketRaw[];
  // Expand / collapse
  isExpanded: boolean;
  onToggleExpand: () => void;
  commitFiles?: CommitFile[];
  loadingFiles: boolean;
  expandedFileKey: string | null;
  onToggleFile: (path: string) => void;
  commitFileDiffs: Record<string, string>;
  loadingFileDiff: string | null;
  // External links
  githubRepoUrl: string | null;
}

export function CommitItem({
  raw,
  slug: _slug,
  compact,
  onStartChat,
  onViewExternal: _onViewExternal,
  relatedDeployments,
  relatedTickets,
  isExpanded,
  onToggleExpand,
  commitFiles,
  loadingFiles,
  expandedFileKey,
  onToggleFile,
  commitFileDiffs,
  loadingFileDiff,
  githubRepoUrl,
}: CommitItemProps) {
  return (
    <div className="group border-b border-border/50 last:border-0">
      {/* ── Main row (clickable) ────────────────────────────────────── */}
      <div
        className={cn(
          "flex items-start px-3 cursor-pointer transition-colors",
          compact ? "gap-2 py-1.5 hover:bg-muted/5" : "gap-2.5 py-2.5",
          !compact && (isExpanded ? "bg-muted/20" : "hover:bg-muted/10")
        )}
        onClick={onToggleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand();
          }
        }}
      >
        {/* Chevron — hidden in compact/sidebar mode */}
        {!compact && (
          <span className="mt-1 shrink-0 text-[10px] text-muted-foreground/60 w-2.5 text-center select-none">
            {isExpanded ? "\u25BE" : "\u25B8"}
          </span>
        )}

        {/* Icon */}
        <div
          className={cn(
            "shrink-0 flex items-center justify-center rounded-full bg-violet-500/10 text-violet-400",
            compact ? "mt-0.5 h-4 w-4" : "mt-0.5 h-5 w-5"
          )}
        >
          <svg
            width={compact ? "8" : "10"}
            height={compact ? "8" : "10"}
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
        {compact ? (
          /* ── Compact sidebar layout: 2 tight lines ─────────────────── */
          <div className="min-w-0 flex-1">
            {/* Line 1: hash + subject (single truncated line) */}
            <Tooltip>
              <TooltipTrigger render={<div />}>
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded">
                    {raw.shortHash}
                  </span>
                  <span className="text-xs text-foreground truncate">
                    {raw.subject}
                  </span>
                </div>
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
            {/* Line 2: deployment dots + author + time */}
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground overflow-hidden">
              {relatedDeployments?.map((dep) => {
                const isFailed =
                  dep.status === "FAILED" || dep.status === "CRASHED";
                const isLive = dep.status === "SUCCESS";
                const isBuilding =
                  dep.status === "DEPLOYING" || dep.status === "BUILDING";
                const dotColor = isFailed
                  ? "#f87171"
                  : isLive
                    ? "#4ade80"
                    : isBuilding
                      ? "#facc15"
                      : "#6b7280";
                return (
                  <span
                    key={dep.id}
                    className="inline-flex items-center gap-0.5 shrink-0"
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        isBuilding && "animate-pulse"
                      )}
                      style={{ backgroundColor: dotColor }}
                    />
                    <span className="text-[9px]">{dep.serviceName}</span>
                  </span>
                );
              })}
              {relatedTickets?.map((ticket) => (
                <span
                  key={ticket.identifier}
                  className="shrink-0 font-mono text-[9px] text-blue-400"
                >
                  {ticket.identifier}
                </span>
              ))}
              <span className="truncate">
                {raw.author} &middot; {relativeTime(raw.date)}
              </span>
            </div>
          </div>
        ) : (
          /* ── Full layout (overview page, expandable) ────────────────── */
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
              <div className="mt-1 flex flex-wrap gap-1 items-center">
                {relatedDeployments && relatedDeployments.length > 0 && (
                  <>
                    {/* Tiny "deployed ->" label */}
                    <span className="text-[10px] text-muted-foreground/60 mr-0.5">
                      deployed &rarr;
                    </span>
                    {relatedDeployments.map((dep) => {
                      const isFailed =
                        dep.status === "FAILED" || dep.status === "CRASHED";
                      const isLive = dep.status === "SUCCESS";
                      const isBuilding =
                        dep.status === "DEPLOYING" || dep.status === "BUILDING";
                      const badgeClasses = cn(
                        "inline-flex items-center gap-1 text-[10px] px-1 py-0.5 rounded font-medium",
                        isFailed && "bg-red-500/10 text-red-400",
                        isLive && "bg-green-500/10 text-green-400",
                        isBuilding && "bg-yellow-500/10 text-yellow-400",
                        !isFailed &&
                          !isLive &&
                          !isBuilding &&
                          "bg-muted text-muted-foreground",
                        dep.dashboardUrl
                          ? "cursor-pointer hover:opacity-80 transition-opacity"
                          : "cursor-default"
                      );
                      const inner = (
                        <>
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full bg-current shrink-0",
                              isBuilding && "animate-pulse"
                            )}
                          />
                          {dep.serviceName}
                        </>
                      );
                      return (
                        <Tooltip key={dep.id}>
                          <TooltipTrigger>
                            {dep.dashboardUrl ? (
                              <a
                                href={dep.dashboardUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className={badgeClasses}
                              >
                                {inner}
                              </a>
                            ) : (
                              <span className={badgeClasses}>{inner}</span>
                            )}
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {dep.serviceName}: {dep.status}
                            {dep.dashboardUrl && (
                              <span className="ml-1 opacity-60">
                                &uarr; Railway
                              </span>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </>
                )}
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
              {raw.author} &middot; {relativeTime(raw.date)}
            </p>
          </div>
        )}

        {/* Hover actions */}
        <div
          className={cn(
            "shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
            compact && "mt-0.5"
          )}
        >
          {/* GitHub link */}
          {githubRepoUrl && (
            <a
              href={`${githubRepoUrl}/commit/${raw.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
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
            </a>
          )}
          {/* Railway logs (first related deployment) */}
          {(relatedDeployments?.[0]?.logsUrl ||
            relatedDeployments?.[0]?.dashboardUrl) && (
            <a
              href={
                relatedDeployments[0].logsUrl ??
                relatedDeployments[0].dashboardUrl!
              }
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="View Railway logs"
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
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
            </a>
          )}
          {!compact && (
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
              ★ Chat
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded panel ──────────────────────────────────────────── */}
      {isExpanded && (
        <div className="border-t border-border/30 bg-muted/10">
          {/* Commit body (if any) */}
          {raw.body?.trim() && (
            <div className="border-b border-border/30 px-4 py-2 text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {raw.body.trim()}
            </div>
          )}

          {/* Quick links bar */}
          <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border/30 text-[10px]">
            {githubRepoUrl && (
              <a
                href={`${githubRepoUrl}/commit/${raw.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                View on GitHub
              </a>
            )}
            {relatedDeployments?.map((dep) =>
              dep.logsUrl || dep.dashboardUrl ? (
                <a
                  key={dep.id}
                  href={dep.logsUrl ?? dep.dashboardUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300 hover:underline inline-flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0"
                  >
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                  {dep.serviceName} logs
                </a>
              ) : null
            )}
            {relatedDeployments?.map((dep) =>
              dep.serviceUrl ? (
                <a
                  key={`svc-${dep.id}`}
                  href={dep.serviceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-400 hover:text-green-300 hover:underline inline-flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  {dep.serviceName}
                </a>
              ) : null
            )}
          </div>

          {/* Files list */}
          {loadingFiles ? (
            <div className="px-4 py-3 text-[11px] text-muted-foreground flex items-center gap-2">
              <span className="h-3 w-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              Loading files...
            </div>
          ) : commitFiles ? (
            commitFiles.length === 0 ? (
              <div className="px-4 py-3 text-[11px] text-muted-foreground">
                No files changed
              </div>
            ) : (
              <div>
                <div className="px-4 py-1.5 text-[10px] text-muted-foreground/60">
                  {commitFiles.length} file
                  {commitFiles.length !== 1 ? "s" : ""} changed
                  {(() => {
                    const totalAdd = commitFiles.reduce(
                      (s, f) => s + f.additions,
                      0
                    );
                    const totalDel = commitFiles.reduce(
                      (s, f) => s + f.deletions,
                      0
                    );
                    return (
                      <>
                        {totalAdd > 0 && (
                          <span className="text-green-400 ml-1.5">
                            +{totalAdd}
                          </span>
                        )}
                        {totalDel > 0 && (
                          <span className="text-red-400 ml-1">-{totalDel}</span>
                        )}
                      </>
                    );
                  })()}
                </div>
                {commitFiles.map((file) => {
                  const fileKey = `${raw.hash}:${file.path}`;
                  const isFileExpanded = expandedFileKey === fileKey;
                  const diffContent = commitFileDiffs[fileKey];
                  const isLoadingDiff = loadingFileDiff === fileKey;

                  return (
                    <div key={file.path}>
                      {/* File row */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFile(file.path);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 px-4 py-1 text-left transition-colors",
                          isFileExpanded ? "bg-muted/30" : "hover:bg-muted/20"
                        )}
                      >
                        <span className="shrink-0 text-[10px] text-muted-foreground/50 w-2 text-center select-none">
                          {isFileExpanded ? "\u25BE" : "\u25B8"}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-green-400">
                          +{file.additions}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-red-400">
                          -{file.deletions}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                          {file.path}
                        </span>
                        {/* GitHub file diff link */}
                        {githubRepoUrl && (
                          <a
                            href={`${githubRepoUrl}/commit/${raw.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors"
                            onClick={(e) => e.stopPropagation()}
                            title="View file diff on GitHub"
                          >
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
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </a>
                        )}
                      </button>

                      {/* Inline diff */}
                      {isFileExpanded && (
                        <div className="border-t border-b border-border/30 bg-muted/20 px-2 py-1.5 max-h-[500px] overflow-auto">
                          {isLoadingDiff ? (
                            <div className="flex items-center gap-2 px-2 py-2 text-[11px] text-muted-foreground">
                              <span className="h-3 w-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                              Loading diff...
                            </div>
                          ) : diffContent ? (
                            <DiffView diff={diffContent} />
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : null}
        </div>
      )}
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
