"use client";

import { useEffect, useRef } from "react";

import type { CommitRaw, TicketRaw } from "@/lib/activity-types";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TicketItemProps {
  raw: TicketRaw;
  onStartChat: () => void;
  onAddToTray?: () => void;
  relatedCommits?: CommitRaw[];
  /** Whether ticket is expanded inline (overview page) */
  isExpanded?: boolean;
  /** Click handler — navigates in sidebar mode, toggles expand in overview mode */
  onToggleExpand?: () => void;
  /** Sidebar mode — compact layout, no inline expansion */
  compact?: boolean;
}

const PRIORITY_ICON: Record<number, { icon: string; className: string }> = {
  1: { icon: "\u2191\u2191", className: "text-red-400" }, // Urgent
  2: { icon: "\u2191", className: "text-orange-400" }, // High
  3: { icon: "\u2192", className: "text-yellow-400" }, // Medium
  4: { icon: "\u2193", className: "text-muted-foreground" }, // Low
};

export function TicketItem({
  raw,
  onStartChat,
  onAddToTray,
  relatedCommits,
  isExpanded = false,
  onToggleExpand,
  compact = false,
}: TicketItemProps) {
  const priority =
    raw.priority !== undefined ? PRIORITY_ICON[raw.priority] : null;

  const rowRef = useRef<HTMLDivElement>(null);

  // Auto-scroll into view when initially expanded (e.g. navigated via ?ticket=)
  useEffect(() => {
    if (isExpanded && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // Only run on mount when initially expanded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={rowRef}
      className="group border-b border-border/50 last:border-0"
      data-ticket-id={raw.identifier}
    >
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
            onToggleExpand?.();
          }
        }}
      >
        {/* Chevron — hidden in compact/sidebar mode */}
        {!compact && (
          <span className="mt-1 shrink-0 text-[10px] text-muted-foreground/60 w-2.5 text-center select-none">
            {isExpanded ? "\u25BE" : "\u25B8"}
          </span>
        )}

        {/* Status color dot as icon */}
        <div className={cn("shrink-0", compact ? "mt-0.5" : "mt-1")}>
          <span
            className={cn(
              "block rounded-full border-2",
              compact ? "h-2.5 w-2.5" : "h-3 w-3"
            )}
            style={{
              borderColor: raw.statusColor,
              backgroundColor: `${raw.statusColor}20`,
            }}
            title={raw.status}
          />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="shrink-0 font-mono text-[10px] font-medium text-muted-foreground bg-muted px-1 py-0.5 rounded">
              {raw.identifier}
            </span>
            {priority && (
              <span
                className={cn(
                  "shrink-0 text-[10px] font-bold",
                  priority.className
                )}
              >
                {priority.icon}
              </span>
            )}
          </div>

          {/* Title with full title + description tooltip */}
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <span className="mt-0.5 text-xs text-foreground leading-snug line-clamp-2 cursor-default block">
                {raw.title}
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-[320px] whitespace-pre-wrap break-words"
            >
              <span className="font-medium">{raw.title}</span>
              {raw.description?.trim() && (
                <>
                  {"\n"}
                  <span className="opacity-70 whitespace-pre-wrap">
                    {raw.description.trim()}
                  </span>
                </>
              )}
            </TooltipContent>
          </Tooltip>

          {/* Correlated commit badges */}
          {relatedCommits && relatedCommits.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {relatedCommits.map((commit) => (
                <Tooltip key={commit.hash}>
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
                      {commit.shortHash}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-xs whitespace-pre-wrap"
                  >
                    <span className="font-medium">{commit.subject}</span>
                    {commit.body?.trim() && (
                      <>
                        {"\n"}
                        <span className="opacity-70 whitespace-pre-wrap">
                          {commit.body.trim()}
                        </span>
                      </>
                    )}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}

          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {raw.status}
            {raw.assignee && ` \u00b7 ${raw.assignee}`}
            {raw.updatedAt && ` \u00b7 ${relativeTime(raw.updatedAt)}`}
          </p>
        </div>

        {/* Hover actions */}
        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <a
            href={raw.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="View on Linear"
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
          {onAddToTray && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddToTray();
              }}
              className="rounded px-2 py-0.5 text-[10px] font-medium border border-border hover:bg-muted transition-colors"
              title="Add to context tray"
            >
              📎 Add
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartChat();
            }}
            className="rounded px-2 py-0.5 text-[10px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            title="Start a chat about this issue"
          >
            ✦ Chat
          </button>
        </div>
      </div>

      {/* ── Expanded content ──────────────────────────────────────────── */}
      {isExpanded && (
        <div className="border-t border-border/30 bg-muted/10 px-3 py-2.5 space-y-2.5">
          {/* Description */}
          {raw.description?.trim() && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {raw.description.trim()}
            </p>
          )}

          {/* Quick links */}
          <div className="flex flex-wrap items-center gap-2">
            {raw.url && (
              <a
                href={raw.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-400 hover:text-blue-300 transition-colors"
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
                View on Linear
              </a>
            )}
          </div>

          {/* Related commits (expanded view) */}
          {relatedCommits && relatedCommits.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Related commits
              </p>
              {relatedCommits.map((commit) => (
                <div
                  key={commit.hash}
                  className="flex items-start gap-2 text-xs"
                >
                  <span className="shrink-0 font-mono text-[10px] font-medium text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded">
                    {commit.shortHash}
                  </span>
                  <span className="text-foreground/80 line-clamp-1">
                    {commit.subject}
                  </span>
                </div>
              ))}
            </div>
          )}
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
