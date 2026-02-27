"use client";

import { cn } from "@/lib/utils";
import type { CommitRaw } from "@/lib/activity-types";

interface CommitItemProps {
  raw: CommitRaw;
  onStartChat: () => void;
  onViewExternal?: () => void;
}

export function CommitItem({ raw, onStartChat, onViewExternal }: CommitItemProps) {
  return (
    <div className="group border-b border-border/50 last:border-0">
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        {/* Icon */}
        <div className="mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/10 text-violet-400">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <line x1="3" y1="12" x2="9" y2="12" />
            <line x1="15" y1="12" x2="21" y2="12" />
          </svg>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded">
              {raw.shortHash}
            </span>
            {raw.branch && (
              <span className="shrink-0 text-[10px] text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded font-medium">
                {raw.branch}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-foreground leading-snug line-clamp-2">
            {raw.subject}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {raw.author} · {relativeTime(raw.date)}
          </p>
        </div>

        {/* Hover actions */}
        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onViewExternal && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onViewExternal(); }}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="View on GitHub"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStartChat(); }}
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
