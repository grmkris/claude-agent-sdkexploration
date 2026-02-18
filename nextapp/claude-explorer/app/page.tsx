"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useState, Suspense } from "react"
import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { SessionList } from "@/components/session-list"
import type { Project } from "@/lib/types"

function DashboardContent() {
  const searchParams = useSearchParams()
  const selectedProject = searchParams.get("project")

  if (selectedProject) {
    return (
      <div className="flex-1 overflow-auto p-4">
        <h2 className="mb-4 text-sm font-medium">
          Sessions for {selectedProject.replace(/-/g, "/").split("/").slice(-2).join("/")}
        </h2>
        <SessionList projectSlug={selectedProject} />
      </div>
    )
  }

  return <ProjectGrid />
}

function ProjectGrid() {
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

  if (loading) {
    return (
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        No projects found in ~/.claude/projects/
      </div>
    )
  }

  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => {
        const shortPath = project.path.split("/").slice(-2).join("/")
        return (
          <Link key={project.slug} href={`/?project=${project.slug}`}>
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
        )
      })}
    </div>
  )
}

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

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-4"><Skeleton className="h-28" /></div>}>
      <DashboardContent />
    </Suspense>
  )
}
