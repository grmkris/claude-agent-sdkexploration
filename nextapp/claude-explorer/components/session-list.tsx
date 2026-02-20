"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { SessionCard } from "./session-card"
import { Skeleton } from "@/components/ui/skeleton"
import { orpc } from "@/lib/orpc"
import { client } from "@/lib/orpc-client"

export function SessionList({ projectSlug }: { projectSlug: string }) {
  const queryClient = useQueryClient()
  const { data: sessions, isLoading } = useQuery(
    orpc.sessions.list.queryOptions({ input: { slug: projectSlug } })
  )
  const { data: favorites } = useQuery(orpc.favorites.get.queryOptions())

  const toggleSession = useMutation({
    mutationFn: (id: string) => client.favorites.toggleSession({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.favorites.get.queryOptions().queryKey }),
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (!sessions || sessions.length === 0) {
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
          isFavorite={favorites?.sessions.includes(session.id)}
          onToggleFavorite={() => toggleSession.mutate(session.id)}
        />
      ))}
    </div>
  )
}
