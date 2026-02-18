"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
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
import type { Project, SessionMeta } from "@/lib/types"

export function ProjectSidebar() {
  const pathname = usePathname()

  // Extract slug from /project/[slug]... paths
  const projectMatch = pathname.match(/^\/project\/([^/]+)/)
  const activeSlug = projectMatch?.[1] ?? null

  if (activeSlug) {
    return <SessionSidebar slug={activeSlug} pathname={pathname} />
  }

  return <ProjectListSidebar pathname={pathname} />
}

function ProjectListSidebar({ pathname }: { pathname: string }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        setProjects(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

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
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))}
              {projects.map((project) => {
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
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [loading, setLoading] = useState(true)
  const shortPath = slug.replace(/-/g, "/").split("/").slice(-2).join("/")

  useEffect(() => {
    fetch(`/api/projects/${slug}/sessions`)
      .then((r) => r.json())
      .then((data) => {
        setSessions(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [slug])

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
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton />
                  </SidebarMenuItem>
                ))}
              {sessions.map((session) => {
                const isActive = pathname === `/project/${slug}/chat/${session.id}`
                return (
                  <SidebarMenuItem key={session.id}>
                    <Link href={`/project/${slug}/chat/${session.id}`}>
                      <SidebarMenuButton isActive={isActive} tooltip={session.firstPrompt}>
                        <span className="truncate">{session.firstPrompt}</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                )
              })}
              {!loading && sessions.length === 0 && (
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
