"use client"

import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { SessionMeta } from "@/lib/types"

export function SessionCard({
  session,
  projectSlug,
}: {
  session: SessionMeta
  projectSlug: string
}) {
  const timeAgo = getTimeAgo(session.timestamp)

  return (
    <Link href={`/project/${projectSlug}/chat/${session.id}`}>
      <Card size="sm" className="cursor-pointer transition-colors hover:bg-accent/50">
        <CardHeader>
          <CardTitle className="line-clamp-2">{session.firstPrompt}</CardTitle>
          <CardDescription>{timeAgo}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {session.model && (
              <Badge variant="outline" className="text-[10px]">
                {session.model.replace("claude-", "")}
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px]">
              {session.turns} turns
            </Badge>
            {session.gitBranch && (
              <Badge variant="secondary" className="text-[10px]">
                {session.gitBranch}
              </Badge>
            )}
            {session.cost > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                ${session.cost.toFixed(4)}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
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
