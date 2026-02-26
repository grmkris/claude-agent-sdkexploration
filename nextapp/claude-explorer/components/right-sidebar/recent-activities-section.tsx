"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { SessionStateBadge } from "@/components/session-state-badge";
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";
import { getTimeAgo } from "@/lib/utils";

export function RecentActivitiesSection({ slug }: { slug: string }) {
  const { data: sessions } = useQuery({
    ...orpc.sessions.timeline.queryOptions({ input: { slug, limit: 5 } }),
    refetchInterval: 15_000,
  });

  if (!sessions?.length) return null;

  return (
    <SidebarGroup>
      <div className="px-2 pb-1 text-[11px] font-medium text-sidebar-foreground/70">
        Recent Activity
      </div>
      <SidebarGroupContent>
        <div className="flex flex-col gap-0.5">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/project/${slug}/chat/${session.id}`}
              className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-sidebar-accent transition-colors"
            >
              <SessionStateBadge sessionId={session.id} compact />
              <span className="flex-1 truncate text-muted-foreground">
                {session.firstPrompt ?? "Untitled"}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground/60">
                {getTimeAgo(session.lastModified ?? session.timestamp)}
              </span>
            </Link>
          ))}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
