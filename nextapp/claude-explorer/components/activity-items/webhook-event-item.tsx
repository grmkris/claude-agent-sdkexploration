"use client";

import type { WebhookEventRaw } from "@/lib/activity-types";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface WebhookEventItemProps {
  raw: WebhookEventRaw;
  onOpen: () => void;
  onStartChat: () => void;
  onAddToTray?: () => void;
}

const PROVIDER_COLORS: Record<string, string> = {
  github: "bg-neutral-500/10 text-neutral-400",
  linear: "bg-violet-500/10 text-violet-400",
  railway: "bg-purple-500/10 text-purple-400",
  generic: "bg-orange-500/10 text-orange-400",
};

export function WebhookEventItem({
  raw,
  onOpen,
  onStartChat,
  onAddToTray,
}: WebhookEventItemProps) {
  const isError = raw.status === "error";
  const isRunning = raw.status === "running";
  const providerColor =
    PROVIDER_COLORS[raw.provider] ?? "bg-orange-500/10 text-orange-400";

  return (
    <div
      className="group border-b border-border/50 last:border-0 cursor-pointer"
      onClick={onOpen}
    >
      <div className="relative flex items-start gap-2.5 px-3 py-2.5">
        {/* Icon */}
        <div
          className={cn(
            "mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-full",
            isError
              ? "bg-red-500/10 text-red-400"
              : "bg-orange-500/10 text-orange-400"
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
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Provider badge */}
            <span
              className={cn(
                "shrink-0 text-[10px] font-medium px-1 py-0.5 rounded capitalize",
                providerColor
              )}
            >
              {raw.provider}
            </span>

            {/* event · action */}
            <span className="text-xs text-foreground font-medium truncate">
              {raw.eventType}
              {raw.action && (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  · {raw.action}
                </span>
              )}
            </span>

            {/* Status dot */}
            <span
              className={cn(
                "shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium px-1 py-0.5 rounded",
                isError && "bg-red-500/10 text-red-400",
                isRunning && "bg-yellow-500/10 text-yellow-400",
                !isError && !isRunning && "bg-green-500/10 text-green-400"
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

          {/* Payload summary */}
          {raw.payloadSummary && (
            <Tooltip>
              <TooltipTrigger render={<span />}>
                <span className="mt-0.5 text-[10px] text-muted-foreground truncate cursor-default block">
                  {raw.payloadSummary}
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-[320px] whitespace-pre-wrap break-words"
              >
                {raw.payloadSummary}
              </TooltipContent>
            </Tooltip>
          )}

          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {relativeTime(raw.timestamp)}
          </p>
        </div>

        {/* Hover actions — overlay on the right with gradient fade */}
        <div
          className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-2 pl-8 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto bg-gradient-to-l from-background from-40% to-transparent"
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
          {raw.sessionId && (
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
            >
              ✦ Chat
            </button>
          )}
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
