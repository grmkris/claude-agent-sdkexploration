"use client"

import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { SessionCard } from "@/components/session-card"
import { orpc } from "@/lib/orpc"
import { client } from "@/lib/orpc-client"

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

function FavoritesSection() {
  const queryClient = useQueryClient()
  const { data: favorites } = useQuery(orpc.favorites.get.queryOptions())
  const { data: projects } = useQuery(orpc.projects.list.queryOptions())
  const { data: recentSessions } = useQuery(
    orpc.sessions.recent.queryOptions({ input: { limit: 50 } })
  )

  const toggleProject = useMutation({
    mutationFn: (slug: string) => client.favorites.toggleProject({ slug }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.favorites.get.queryOptions().queryKey }),
  })

  const toggleSession = useMutation({
    mutationFn: (id: string) => client.favorites.toggleSession({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.favorites.get.queryOptions().queryKey }),
  })

  if (!favorites) return null

  const favProjects = projects?.filter((p) => favorites.projects.includes(p.slug)) ?? []
  const favSessions = recentSessions?.filter((s) => favorites.sessions.includes(s.id)) ?? []

  if (favProjects.length === 0 && favSessions.length === 0) return null

  return (
    <section className="p-4">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Favorites</h2>
      {favProjects.length > 0 && (
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {favProjects.map((project) => {
            const shortPath = project.path.split("/").slice(-2).join("/")
            return (
              <div key={project.slug} className="relative">
                <Link href={`/project/${project.slug}`}>
                  <Card size="sm" className="cursor-pointer transition-colors hover:bg-accent/50">
                    <CardHeader>
                      <CardTitle>{shortPath}</CardTitle>
                      <CardDescription className="truncate text-[11px]">
                        {project.path}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Badge variant="secondary" className="text-[10px]">
                        {project.sessionCount} sessions
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
                <button
                  onClick={() => toggleProject.mutate(project.slug)}
                  className="absolute right-2 top-2 rounded p-1 text-yellow-500 hover:bg-accent"
                  title="Remove from favorites"
                >
                  <StarFilledIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
      {favSessions.length > 0 && (
        <div className="flex flex-col gap-2">
          {favSessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              projectSlug={session.projectSlug}
              projectLabel={session.projectPath.split("/").slice(-2).join("/")}
              isFavorite
              onToggleFavorite={() => toggleSession.mutate(session.id)}
              compact
            />
          ))}
        </div>
      )}
    </section>
  )
}

function RecentChats() {
  const queryClient = useQueryClient()
  const { data: sessions, isLoading } = useQuery(
    orpc.sessions.recent.queryOptions({ input: { limit: 15 } })
  )
  const { data: favorites } = useQuery(orpc.favorites.get.queryOptions())

  const toggleSession = useMutation({
    mutationFn: (id: string) => client.favorites.toggleSession({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.favorites.get.queryOptions().queryKey }),
  })

  if (isLoading) {
    return (
      <section className="p-4">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recent Chats</h2>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </section>
    )
  }

  if (!sessions || sessions.length === 0) return null

  return (
    <section className="p-4">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recent Chats</h2>
      <div className="flex flex-col gap-2">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            projectSlug={session.projectSlug}
            projectLabel={session.projectPath.split("/").slice(-2).join("/")}
            isFavorite={favorites?.sessions.includes(session.id)}
            onToggleFavorite={() => toggleSession.mutate(session.id)}
            compact
          />
        ))}
      </div>
    </section>
  )
}

function ProjectGrid() {
  const queryClient = useQueryClient()
  const { data: projects, isLoading } = useQuery(orpc.projects.list.queryOptions())
  const { data: favorites } = useQuery(orpc.favorites.get.queryOptions())

  const toggleProject = useMutation({
    mutationFn: (slug: string) => client.favorites.toggleProject({ slug }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.favorites.get.queryOptions().queryKey }),
  })

  if (isLoading) {
    return (
      <section className="p-4">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">All Projects</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </section>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        No projects found in ~/.claude/projects/
      </div>
    )
  }

  return (
    <section className="p-4">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">All Projects</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => {
          const shortPath = project.path.split("/").slice(-2).join("/")
          const isFav = favorites?.projects.includes(project.slug)
          return (
            <div key={project.slug} className="relative">
              <Link href={`/project/${project.slug}`}>
                <Card size="sm" className="cursor-pointer transition-colors hover:bg-accent/50">
                  <CardHeader>
                    <CardTitle>{shortPath}</CardTitle>
                    <CardDescription className="truncate text-[11px]">
                      {project.path}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {project.sessionCount} sessions
                      </Badge>
                      {project.lastActive && (
                        <span className="text-[10px] text-muted-foreground">
                          {getTimeAgo(project.lastActive)}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
              <button
                onClick={() => toggleProject.mutate(project.slug)}
                className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                title={isFav ? "Remove from favorites" : "Add to favorites"}
              >
                {isFav ? (
                  <StarFilledIcon className="h-3.5 w-3.5 text-yellow-500" />
                ) : (
                  <StarIcon className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function DashboardPage() {
  return (
    <div>
      <FavoritesSection />
      <RecentChats />
      <ProjectGrid />
    </div>
  )
}

// Inline SVG icons

function StarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function StarFilledIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}
