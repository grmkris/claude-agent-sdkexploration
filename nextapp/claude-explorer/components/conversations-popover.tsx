"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import type { LiveSession } from "@/components/resume-session-popover";
import { StateBadgeInline } from "@/components/session-state-badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { getTimeAgo } from "@/lib/utils";

// ---------------------------------------------------------------------------
// ConversationsPopover — self-contained popover for recent conversations
// ---------------------------------------------------------------------------

export function ConversationsPopover({
  trigger,
}: {
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const [selectedProjectSlug, setSelectedProjectSlug] = React.useState<
    string | null
  >(null);

  const { data: liveSessions = [] } = useQuery({
    ...orpc.liveState.active.queryOptions(),
    refetchInterval: 10_000,
  });

  const { data: projects = [] } = useQuery(orpc.projects.list.queryOptions());

  const { data: recentSessions = [] } = useQuery({
    ...orpc.sessions.timeline.queryOptions({
      input: { limit: 50, slug: selectedProjectSlug ?? undefined },
    }),
    refetchInterval: 15_000,
  });

  const sessionStateMap = React.useMemo(() => {
    const map = new Map<string, LiveSession>();
    for (const s of liveSessions as LiveSession[]) {
      map.set(s.session_id, s);
    }
    return map;
  }, [liveSessions]);

  const archiveAllMutation = useMutation({
    mutationFn: async () => {
      const toArchive = recentSessions.filter(
        (s) => !sessionStateMap.get(s.id)
      );
      await Promise.all(
        toArchive.map((s) => client.sessions.archive({ sessionId: s.id }))
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey;
          return (
            Array.isArray(key) &&
            key.length >= 1 &&
            (key[0] === "sessions" || key[0] === "liveState")
          );
        },
      });
    },
  });

  const projectsWithSessions = React.useMemo(() => {
    const slugs = new Set<string>();
    for (const s of recentSessions) {
      if (s.projectSlug) slugs.add(s.projectSlug);
    }
    for (const s of liveSessions as LiveSession[]) {
      if (s.project_path) {
        const proj = projects.find(
          (p) =>
            s.project_path === p.path ||
            s.project_path?.startsWith(p.path + "/")
        );
        if (proj) slugs.add(proj.slug);
      }
    }
    return Array.from(slugs).sort();
  }, [recentSessions, liveSessions, projects]);

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="center" className="w-96 p-0" sideOffset={4}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-xs font-semibold">Recent Conversations</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                archiveAllMutation.mutate();
              }}
              disabled={
                archiveAllMutation.isPending || recentSessions.length === 0
              }
              title="Archive all non-live conversations"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3"
              >
                <path d="M21 8v13H3V8" />
                <path d="M1 3h22v5H1z" />
                <path d="M10 12h4" />
              </svg>
              {archiveAllMutation.isPending ? "Archiving..." : "Archive all"}
            </button>
            <button
              onClick={() => {
                const slugMatch = pathname.match(/^\/project\/([^/]+)/);
                const slug = slugMatch?.[1];
                const url = slug
                  ? `/project/${slug}/chat?_new=${Date.now()}`
                  : `/chat?_new=${Date.now()}`;
                setPopoverOpen(false);
                router.push(url);
              }}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              New
            </button>
          </div>
        </div>

        {/* Project filter chips */}
        {projectsWithSessions.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto border-b px-3 py-2 scrollbar-none">
            <button
              onClick={() => setSelectedProjectSlug(null)}
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                selectedProjectSlug === null
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {projectsWithSessions.map((slug) => (
              <button
                key={slug}
                onClick={() =>
                  setSelectedProjectSlug(
                    selectedProjectSlug === slug ? null : slug
                  )
                }
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                  selectedProjectSlug === slug
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {slug.replace(/^-home-bun-projects-/, "").replace(/-/g, " ")}
              </button>
            ))}
          </div>
        )}

        {/* Session list */}
        <div className="flex flex-col max-h-[60vh] overflow-y-auto">
          {recentSessions.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No conversations yet
            </div>
          ) : (
            recentSessions.map((session) => {
              const liveSession = sessionStateMap.get(session.id);
              const url = session.projectSlug
                ? `/project/${session.projectSlug}/chat/${session.id}`
                : `/chat/${session.id}`;

              return (
                <Link
                  key={session.id}
                  href={url}
                  onClick={() => setPopoverOpen(false)}
                  className="flex items-start gap-2.5 border-b last:border-b-0 px-3 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <div className="pt-0.5">
                    {liveSession ? (
                      <StateBadgeInline
                        state={liveSession.state}
                        currentTool={liveSession.current_tool}
                        compact
                      />
                    ) : (
                      <svg
                        className="h-3.5 w-3.5 text-muted-foreground/50"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                      >
                        <path d="M2.75 0h10.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 14H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 15.543V14H2.75A1.75 1.75 0 0 1 1 12.25V1.75C1 .784 1.784 0 2.75 0Z" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {session.firstPrompt || "Untitled session"}
                    </p>
                    {session.projectSlug && (
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {session.projectSlug
                          .replace(/^-home-bun-projects-/, "")
                          .replace(/-/g, " ")}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      {getTimeAgo(session.lastModified)}
                    </span>
                    {liveSession && (
                      <span className="text-[10px] font-medium text-green-500">
                        live
                      </span>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// useActiveCount — shared hook for active session count
// ---------------------------------------------------------------------------

export function useActiveCount() {
  const { data: liveSessions = [] } = useQuery({
    ...orpc.liveState.active.queryOptions(),
    refetchInterval: 10_000,
  });

  return (liveSessions as LiveSession[]).filter(
    (s) => s.state !== "done" && s.state !== "stopped" && s.state !== "error"
  ).length;
}
