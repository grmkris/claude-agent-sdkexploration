"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";

export function RecentConversationsTab() {
  const pathname = usePathname();

  const { data: sessions, isLoading } = useQuery({
    ...orpc.sessions.recent.queryOptions({ input: { limit: 30 } }),
    refetchInterval: 30_000,
  });

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {isLoading &&
            Array.from({ length: 6 }).map((_, i) => (
              <SidebarMenuItem key={i}>
                <SidebarMenuSkeleton />
              </SidebarMenuItem>
            ))}

          {!isLoading && (!sessions || sessions.length === 0) && (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              No recent conversations
            </div>
          )}

          {sessions?.map((session) => {
            const href = session.projectSlug
              ? `/project/${session.projectSlug}/chat/${session.id}`
              : `/chat/${session.id}`;
            const isActive = pathname.includes(session.id);
            const projectName = session.projectPath
              ? session.projectPath.split("/").at(-1)
              : null;

            return (
              <SidebarMenuItem key={session.id}>
                <SidebarMenuButton
                  isActive={isActive}
                  render={<Link href={href} />}
                  tooltip={session.firstPrompt}
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate leading-tight">
                      {session.firstPrompt.slice(0, 60) ||
                        "Untitled conversation"}
                    </span>
                    {projectName && (
                      <span className="truncate text-muted-foreground">
                        {projectName}
                      </span>
                    )}
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
