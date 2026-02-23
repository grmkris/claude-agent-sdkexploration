"use client";

import Link from "next/link";
import { useState } from "react";

import type { SessionMeta, SessionState, TmuxPane } from "@/lib/types";

import { StarIcon, StarFilledIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { getTimeAgo } from "@/lib/utils";

export interface SessionFacetData {
  outcome?: string;
  helpfulness?: string;
  briefSummary?: string;
  sessionType?: string;
}

export function SessionCard({
  session,
  projectSlug,
  isFavorite,
  onToggleFavorite,
  compact,
  projectLabel,
  tmuxPane,
  unreadCount,
  facet,
  sessionState,
}: {
  session: SessionMeta;
  projectSlug: string;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  compact?: boolean;
  projectLabel?: string;
  tmuxPane?: TmuxPane;
  unreadCount?: number;
  facet?: SessionFacetData;
  sessionState?: SessionState;
}) {
  const [copied, setCopied] = useState(false);

  const copyCommand = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void navigator.clipboard.writeText(session.resumeCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleStar = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite?.();
  };

  const timeAgo = getTimeAgo(session.lastModified || session.timestamp);

  return (
    <Link href={`/project/${projectSlug}/chat/${session.id}`}>
      <Card
        size="sm"
        className="cursor-pointer transition-colors hover:bg-accent/50"
      >
        <CardHeader>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {projectLabel && (
                <p className="mb-0.5 text-[10px] text-muted-foreground">
                  {projectLabel}
                </p>
              )}
              <CardTitle className="flex items-center gap-1.5 line-clamp-2">
                {sessionState === "active" && (
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-green-500"
                    title="Active"
                  />
                )}
                {sessionState === "idle" && (
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                    title="Waiting for input"
                  />
                )}
                {sessionState === "stale" && (
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400"
                    title="Stale"
                  />
                )}
                {facet?.briefSummary || session.firstPrompt}
              </CardTitle>
              {facet?.briefSummary &&
                facet.briefSummary !== session.firstPrompt && (
                  <p className="line-clamp-1 text-[10px] text-muted-foreground">
                    {session.firstPrompt}
                  </p>
                )}
              <CardDescription>
                {timeAgo}
                {facet?.outcome && (
                  <span
                    className={`ml-1.5 text-[10px] ${
                      facet.outcome === "fully_achieved"
                        ? "text-green-400"
                        : facet.outcome === "partially_achieved"
                          ? "text-yellow-400"
                          : "text-muted-foreground"
                    }`}
                  >
                    {facet.outcome.replace(/_/g, " ")}
                  </span>
                )}
                {tmuxPane && (
                  <span className="ml-1.5 text-green-400">
                    tmux {tmuxPane.session}:{tmuxPane.window}.{tmuxPane.pane}
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {unreadCount && unreadCount > 0 ? (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-medium text-white">
                  {unreadCount}
                </span>
              ) : null}
              <button
                onClick={copyCommand}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Copy resume command"
              >
                {copied ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : (
                  <ClipboardIcon className="h-3.5 w-3.5" />
                )}
              </button>
              {onToggleFavorite && (
                <button
                  onClick={handleStar}
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={
                    isFavorite ? "Remove from favorites" : "Add to favorites"
                  }
                >
                  {isFavorite ? (
                    <StarFilledIcon className="h-3.5 w-3.5 text-yellow-500" />
                  ) : (
                    <StarIcon className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        {!compact && (
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {session.model && (
                <Badge variant="outline" className="text-[10px]">
                  {session.model.replace("claude-", "")}
                </Badge>
              )}
              {session.gitBranch && (
                <Badge variant="secondary" className="text-[10px]">
                  {session.gitBranch}
                </Badge>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </Link>
  );
}

// Inline SVG icons

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
