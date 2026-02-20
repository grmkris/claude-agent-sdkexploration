"use client"

import { useQuery } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { orpc } from "@/lib/orpc"

export function ActiveBadge() {
  const { data: sessions } = useQuery({
    ...orpc.sessions.recent.queryOptions({ input: { limit: 50 } }),
    refetchInterval: 5000,
  })

  const activeCount = sessions?.filter((s) => s.isActive).length ?? 0
  if (activeCount === 0) return null

  return (
    <Badge variant="outline" className="ml-auto gap-1.5 text-[10px] text-green-500 border-green-500/30">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
      {activeCount} active
    </Badge>
  )
}
