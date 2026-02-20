"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
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
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { orpc } from "@/lib/orpc"

export function ProjectSidebar() {
  const pathname = usePathname()

  const projectMatch = pathname.match(/^\/project\/([^/]+)/)
  const activeSlug = projectMatch?.[1] ?? null

  if (activeSlug) {
    return <SessionSidebar slug={activeSlug} pathname={pathname} />
  }

  return <ProjectListSidebar pathname={pathname} />
}

function ProjectListSidebar({ pathname }: { pathname: string }) {
  const { data: projects, isLoading } = useQuery(orpc.projects.list.queryOptions())

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/">
          <div className="px-2 py-1 text-sm font-semibold">Claude Explorer</div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))}
              {projects?.map((project) => {
                const shortPath = project.path.split("/").slice(-2).join("/")
                const isActive = pathname === `/project/${project.slug}`
                return (
                  <SidebarMenuItem key={project.slug}>
                    <Link href={`/project/${project.slug}`}>
                      <SidebarMenuButton isActive={isActive} tooltip={project.path}>
                        <span className="truncate">{shortPath}</span>
                        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                          {project.sessionCount}
                        </span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

function SessionSidebar({ slug, pathname }: { slug: string; pathname: string }) {
  const { data: sessions, isLoading } = useQuery({
    ...orpc.sessions.list.queryOptions({ input: { slug } }),
    refetchInterval: 5000,
  })
  const shortPath = slug.replace(/-/g, "/").split("/").slice(-2).join("/")

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/">
          <div className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
            &larr; All Projects
          </div>
        </Link>
        <div className="px-2 py-1 text-sm font-semibold truncate">{shortPath}</div>
        <Link href={`/project/${slug}/chat`}>
          <Button size="sm" className="w-full">
            New Chat
          </Button>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Sessions</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton />
                  </SidebarMenuItem>
                ))}
              {sessions?.map((session) => {
                const isSelected = pathname === `/project/${slug}/chat/${session.id}`
                return (
                  <SidebarMenuItem key={session.id}>
                    <Link href={`/project/${slug}/chat/${session.id}`}>
                      <SidebarMenuButton isActive={isSelected} tooltip={session.firstPrompt}>
                        {session.isActive && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                        )}
                        <span className="truncate">{session.firstPrompt}</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                )
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
  )
}
