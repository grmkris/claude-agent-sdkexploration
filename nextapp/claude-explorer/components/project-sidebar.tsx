"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SessionStateBadge } from "@/components/session-state-badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";

export function ProjectSidebar() {
  const pathname = usePathname();

  const { data: sessions, isLoading } = useQuery({
    ...orpc.sessions.timeline.queryOptions({ input: { limit: 50 } }),
    refetchInterval: 15000,
  });

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/">
          <div className="px-2 py-1 text-sm font-semibold">Claude Explorer</div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <Link href="/analytics">
                  <SidebarMenuButton
                    isActive={pathname === "/analytics"}
                    tooltip="Usage analytics"
                  >
                    <span>Analytics</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/keys">
                  <SidebarMenuButton
                    isActive={pathname === "/keys"}
                    tooltip="API Key Vault"
                  >
                    <span>Keys</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/mcps">
                  <SidebarMenuButton
                    isActive={pathname === "/mcps"}
                    tooltip="MCP Servers & Skills"
                  >
                    <span>MCPs</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/email">
                  <SidebarMenuButton
                    isActive={pathname === "/email"}
                    tooltip="Email Config"
                  >
                    <span>Email</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/webhooks">
                  <SidebarMenuButton
                    isActive={pathname === "/webhooks"}
                    tooltip="Webhooks"
                  >
                    <span>Webhooks</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <Link href="/crons">
                  <SidebarMenuButton
                    isActive={pathname === "/crons"}
                    tooltip="Cron Jobs"
                  >
                    <span>Crons</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton />
                  </SidebarMenuItem>
                ))}
              {sessions?.map((session) => {
                const sessionUrl = `/project/${session.projectSlug}/chat/${session.id}`;
                const isSelected = pathname === sessionUrl;
                const projectLabel = session.projectPath
                  .split("/")
                  .slice(-2)
                  .join("/");
                return (
                  <SidebarMenuItem key={session.id}>
                    <Link href={sessionUrl}>
                      <SidebarMenuButton
                        isActive={isSelected}
                        tooltip={session.firstPrompt}
                      >
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm">
                            {session.firstPrompt}
                          </span>
                          <span className="truncate text-[10px] text-muted-foreground">
                            {projectLabel}
                          </span>
                        </div>
                        <span className="ml-auto">
                          <SessionStateBadge sessionId={session.id} compact />
                        </span>
                      </SidebarMenuButton>
                    </Link>
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
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
