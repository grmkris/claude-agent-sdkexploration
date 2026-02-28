"use client";

import type { CronEventRaw } from "@/lib/activity-types";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CronEventItemProps {
  raw: CronEventRaw;
  slug: string;
  onOpen: () => void;
  onStartChat: () => void;
  onAddToTray?: () => void;
}

export function CronEventItem({
  raw,
  onOpen,
  onStartChat,
  onAddToTray,
}: CronEventItemProps) {
  const isError = raw.status === "error";
  const isRunning = raw.status === "running";

  return (
    <div
      className="group border-b border-border/50 last:border-0 cursor-pointer"
      onClick={onOpen}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        {/* Icon */}
        <div
          className={cn(
            "mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-full",
            isError
              ? "bg-red-500/10 text-red-400"
              : isRunning
                ? "bg-yellow-500/10 text-yellow-400"
                : "bg-teal-500/10 text-teal-400"
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
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Expression badge */}
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded">
              {raw.expression}
            </span>

            {/* Status dot */}
            <span
              className={cn(
                "shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium px-1 py-0.5 rounded",
                isError && "bg-red-500/10 text-red-400",
                isRunning && "bg-yellow-500/10 text-yellow-400",
                !isError && !isRunning && "bg-teal-500/10 text-teal-400"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full bg-current shrink-0",
                  isRunning && "animate-pulse"
                )}
              />
              {raw.status}
            </span>
          </div>

          {/* Prompt (truncated) */}
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <span className="mt-0.5 text-[10px] text-foreground/80 line-clamp-2 cursor-default block">
                {raw.prompt}
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-[320px] whitespace-pre-wrap break-words"
            >
              {raw.prompt}
            </TooltipContent>
          </Tooltip>

          {/* Error message */}
          {isError && raw.error && (
            <p className="mt-0.5 text-[10px] text-red-400 truncate">
              {raw.error}
            </p>
          )}

          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {relativeTime(raw.timestamp)}
          </p>
        </div>

        {/* Hover actions */}
        <div
          className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
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
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
              isError
                ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {raw.sessionId ? "✦ Chat" : "✦ Open"}
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
