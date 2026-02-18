"use client"

import { useEffect, useState } from "react"
import { SessionCard } from "./session-card"
import { Skeleton } from "@/components/ui/skeleton"
import type { SessionMeta } from "@/lib/types"

export function SessionList({ projectSlug }: { projectSlug: string }) {
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/projects/${projectSlug}/sessions`)
      .then((r) => r.json())
      .then((data) => {
        setSessions(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [projectSlug])

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No sessions found
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          projectSlug={projectSlug}
        />
      ))}
    </div>
  )
}
