"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ProjectContextSection } from "@/components/project-sidebar/project-context-section";
import { SessionStateBadge } from "@/components/session-state-badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";

const GLOBAL_NAV = [
  { href: "/analytics", label: "Analytics", tooltip: "Usage analytics" },
  { href: "/keys", label: "Keys", tooltip: "API Key Vault" },
  { href: "/mcps", label: "MCPs", tooltip: "MCP Servers & Skills" },
  { href: "/email", label: "Email", tooltip: "Email Config" },
  { href: "/webhooks", label: "Webhooks", tooltip: "Webhooks" },
  { href: "/crons", label: "Crons", tooltip: "Cron Jobs" },
] as const;

/** Extract project slug from paths like /project/[slug] or /project/[slug]/chat/[id] */
function extractProjectSlug(pathname: string): string | null {
  const match = pathname.match(/^\/project\/([^/]+)/);
  return match ? match[1] : null;
}

export function ProjectSidebar() {
  const pathname = usePathname();
  const projectSlug = extractProjectSlug(pathname);

  const { data: sessions, isLoading } = useQuery({
    ...orpc.sessions.timeline.queryOptions({ input: { limit: 50 } }),
    refetchInterval: 15000,
  });

  // When on a project page, show only that project's sessions in the sidebar
  const filteredSessions = projectSlug
    ? (sessions?.filter((s) => s.projectSlug === projectSlug) ?? [])
    : sessions;

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/">
          <div className="px-2 py-1 text-sm font-semibold">Claude Explorer</div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* ── Global navigation ─────────────────────────── */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {GLOBAL_NAV.map(({ href, label, tooltip }) => (
                <SidebarMenuItem key={href}>
                  <Link href={href}>
                    <SidebarMenuButton
                      isActive={pathname === href}
                      tooltip={tooltip}
                    >
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ── Project context (only on /project/[slug] pages) ── */}
        {projectSlug && <ProjectContextSection slug={projectSlug} />}

        {/* ── Sessions list ─────────────────────────────── */}
        {/* The "Sessions" label is already injected by ProjectContextSection when on a project page */}
        <SidebarGroup>
          {!projectSlug && <SidebarGroupLabel>Recent sessions</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton />
                  </SidebarMenuItem>
                ))}

              {filteredSessions?.map((session) => {
                const sessionUrl = session.projectSlug
                  ? `/project/${session.projectSlug}/chat/${session.id}`
                  : `/chat/${session.id}`;
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
                          {/* Only show project label when on the home view */}
                          {!projectSlug && (
                            <span className="truncate text-[10px] text-muted-foreground">
                              {projectLabel}
                            </span>
                          )}
                        </div>
                        <span className="ml-auto shrink-0">
                          <SessionStateBadge sessionId={session.id} compact />
                        </span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                );
              })}

              {!isLoading &&
                (!filteredSessions || filteredSessions.length === 0) && (
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
