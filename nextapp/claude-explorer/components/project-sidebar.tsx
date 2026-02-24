"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
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

  if (pathname.startsWith("/chat")) {
    return <RootSessionSidebar pathname={pathname} />;
  }

  const projectMatch = pathname.match(/^\/project\/([^/]+)/);
  const activeSlug = projectMatch?.[1] ?? null;

  if (activeSlug) {
    return <SessionSidebar slug={activeSlug} pathname={pathname} />;
  }

  return <ProjectListSidebar pathname={pathname} />;
}

function ProjectListSidebar({ pathname }: { pathname: string }) {
  const { data: projects, isLoading } = useQuery({
    ...orpc.projects.list.queryOptions(),
    refetchInterval: 15000,
  });
  const { data: tmuxPanes } = useQuery({
    ...orpc.tmux.panes.queryOptions(),
    refetchInterval: 30000,
  });

  // Build tmux lookup
  const tmuxBySlug = new Set<string>();
  if (tmuxPanes) {
    for (const p of tmuxPanes) tmuxBySlug.add(p.projectSlug);
  }

  // Sort: tmux-active first, then by lastActive
  const sorted = [...(projects ?? [])].sort((a, b) => {
    const aTmux = tmuxBySlug.has(a.slug) ? 1 : 0;
    const bTmux = tmuxBySlug.has(b.slug) ? 1 : 0;
    if (aTmux !== bTmux) return bTmux - aTmux;
    return 0; // already sorted by recency from the API
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))}
              {sorted.map((project) => {
                const label = project.path.split("/").slice(-2).join("/");
                const hasTmux = tmuxBySlug.has(project.slug);
                return (
                  <SidebarMenuItem key={project.slug}>
                    <Link
                      href={`/project/${project.slug}`}
                      className="flex w-full items-center"
                    >
                      <SidebarMenuButton
                        isActive={pathname === `/project/${project.slug}`}
                        tooltip={label}
                      >
                        <span className="truncate">{label}</span>
                      </SidebarMenuButton>
                      {hasTmux && (
                        <span
                          className="mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-green-500"
                          title="tmux active"
                        />
                      )}
                    </Link>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function RootSessionSidebar({ pathname }: { pathname: string }) {
  const { data: sessions, isLoading } = useQuery({
    ...orpc.root.sessions.queryOptions({ input: {} }),
    refetchInterval: 15000,
  });
  const { data: primary } = useQuery(orpc.root.primarySession.queryOptions());

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/">
          <div className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
            &larr; All Projects
          </div>
        </Link>
        <div className="px-2 py-1 text-sm font-semibold">Root</div>
        <Link href="/chat">
          <Button size="sm" className="w-full">
            New Chat
          </Button>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton />
                  </SidebarMenuItem>
                ))}
              {sessions?.map((session) => {
                const isSelected = pathname === `/chat/${session.id}`;
                const isPrimary = primary?.sessionId === session.id;
                return (
                  <SidebarMenuItem key={session.id}>
                    <Link href={`/chat/${session.id}`}>
                      <SidebarMenuButton
                        isActive={isSelected}
                        tooltip={session.firstPrompt}
                      >
                        {isPrimary && (
                          <span
                            className="mr-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"
                            title="Primary"
                          />
                        )}
                        <span className="truncate">{session.firstPrompt}</span>
                        {session.sessionState === "active" && (
                          <span
                            className="ml-auto inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-green-500"
                            title="Active"
                          />
                        )}
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

function SessionSidebar({
  slug,
  pathname,
}: {
  slug: string;
  pathname: string;
}) {
  const { data: sessions, isLoading } = useQuery({
    ...orpc.sessions.list.queryOptions({ input: { slug } }),
    refetchInterval: 15000,
  });
  // Derive short path from slug (e.g. "-Users-foo-Code-myproject" -> "Code/myproject")
  const slugParts = slug.replace(/^-/, "").split("-");
  const shortPath =
    slugParts.length >= 2 ? slugParts.slice(-2).join("/") : slug;

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/">
          <div className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
            &larr; All Projects
          </div>
        </Link>
        <div className="px-2 py-1 text-sm font-semibold truncate">
          {shortPath}
        </div>
        <Link href={`/project/${slug}/chat`}>
          <Button size="sm" className="w-full">
            New Chat
          </Button>
        </Link>
      </SidebarHeader>
      <SidebarContent>
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
                const isSelected =
                  pathname === `/project/${slug}/chat/${session.id}`;
                return (
                  <SidebarMenuItem key={session.id}>
                    <Link href={`/project/${slug}/chat/${session.id}`}>
                      <SidebarMenuButton
                        isActive={isSelected}
                        tooltip={session.firstPrompt}
                      >
                        <span className="truncate">{session.firstPrompt}</span>
                        {session.sessionState === "active" && (
                          <span
                            className="ml-auto inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-green-500"
                            title="Active"
                          />
                        )}
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
