"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SessionStateBadge } from "@/components/session-state-badge";
import {
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";
import { getTimeAgo } from "@/lib/utils";

function ArchiveIcon({ className }: { className?: string }) {
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
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

/**
 * Reusable sessions list panel. Used in:
 * - Left sidebar (root view): shows all sessions
 * - Right sidebar (project view): shows all sessions across projects
 */
export function SessionsPanel({
  filterSlug,
  showProjectLabel = true,
}: {
  filterSlug?: string;
  showProjectLabel?: boolean;
}) {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const queryInput = { limit: 50, ...(filterSlug ? { slug: filterSlug } : {}) };

  const { data: sessions, isLoading } = useQuery({
    ...orpc.sessions.timeline.queryOptions({ input: queryInput }),
    refetchInterval: 15000,
  });

  const archiveMutation = useMutation({
    ...orpc.sessions.archive.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries(
        orpc.sessions.timeline.queryOptions({ input: queryInput })
      );
    },
  });

  return (
    <SidebarGroupContent>
      <SidebarMenu>
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuSkeleton />
            </SidebarMenuItem>
          ))}

        {sessions?.map((session) => {
          const sessionUrl = session.projectSlug
            ? `/project/${session.projectSlug}/chat/${session.id}`
            : `/chat/${session.id}`;
          const isSelected = pathname === sessionUrl;
          const projectLabel = session.projectPath
            .split("/")
            .slice(-2)
            .join("/");

          const timeAgo = getTimeAgo(session.lastModified ?? session.timestamp);

          return (
            <SidebarMenuItem key={session.id}>
              <div className="group flex items-center">
                <Link href={sessionUrl} className="min-w-0 flex-1">
                  <SidebarMenuButton
                    isActive={isSelected}
                    tooltip={session.firstPrompt}
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">
                        {session.firstPrompt}
                      </span>
                      <span className="truncate text-[10px] text-muted-foreground">
                        {showProjectLabel ? `${projectLabel} · ` : ""}
                        {timeAgo}
                      </span>
                    </div>
                  </SidebarMenuButton>
                </Link>
                <div className="ml-auto flex shrink-0 items-center gap-1 pr-1">
                  <SessionStateBadge sessionId={session.id} compact />
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      archiveMutation.mutate({ sessionId: session.id });
                    }}
                    title="Archive conversation"
                    className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-opacity"
                  >
                    <ArchiveIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </SidebarMenuItem>
          );
        })}

        {!isLoading && (!sessions || sessions.length === 0) && (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            No sessions yet
          </div>
        )}
      </SidebarMenu>
    </SidebarGroupContent>
  );
}
