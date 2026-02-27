"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import type { SessionMeta, TmuxPane } from "@/lib/types";

import { StarIcon, StarFilledIcon } from "@/components/icons";
import { SessionActionsMenu } from "@/components/session-actions-menu";
import { SessionStateBadge } from "@/components/session-state-badge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc";
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
  onArchive,
  compact,
  projectLabel,
  tmuxPane,
  unreadCount,
  facet,
}: {
  session: SessionMeta;
  projectSlug: string;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onArchive?: () => void;
  compact?: boolean;
  projectLabel?: string;
  tmuxPane?: TmuxPane;
  unreadCount?: number;
  facet?: SessionFacetData;
}) {
  const handleStar = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite?.();
  };

  // Fetch last reply preview — only for non-compact cards in a terminal state
  const isTerminal =
    session.sessionState === "idle" || session.sessionState === "stale";
  const { data: preview, isLoading: previewLoading } = useQuery({
    ...orpc.sessions.preview.queryOptions({
      input: { sessionId: session.id, slug: projectSlug },
    }),
    enabled: !compact && isTerminal,
    staleTime: 5 * 60 * 1000,
  });

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
                <SessionStateBadge sessionId={session.id} compact />
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
              <SessionActionsMenu
                session={{
                  sessionId: session.id,
                  resumeCommand: session.resumeCommand,
                }}
                onArchive={onArchive}
                triggerClassName="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              />
            </div>
          </div>
        </CardHeader>
        {!compact && (
          <CardContent>
            {/* Last reply preview */}
            {isTerminal && (
              <div className="mb-2 rounded bg-muted/40 px-2.5 py-2">
                <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">
                  Last reply
                </p>
                {previewLoading ? (
                  <div className="space-y-1">
                    <Skeleton className="h-2.5 w-full" />
                    <Skeleton className="h-2.5 w-4/5" />
                  </div>
                ) : preview?.lastAssistantMessage ? (
                  <p className="line-clamp-2 text-[11px] leading-relaxed text-foreground/80">
                    {preview.lastAssistantMessage}
                  </p>
                ) : (
                  <p className="text-[11px] italic text-muted-foreground">
                    No reply recorded
                  </p>
                )}
              </div>
            )}
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
