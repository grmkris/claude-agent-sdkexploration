"use client"

import Link from "next/link"
import { useState } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { SessionMeta } from "@/lib/types"

export function SessionCard({
  session,
  projectSlug,
  isFavorite,
  onToggleFavorite,
  compact,
  projectLabel,
}: {
  session: SessionMeta
  projectSlug: string
  isFavorite?: boolean
  onToggleFavorite?: () => void
  compact?: boolean
  projectLabel?: string
}) {
  const [copied, setCopied] = useState(false)

  const copyCommand = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(session.resumeCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleStar = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onToggleFavorite?.()
  }

  const timeAgo = getTimeAgo(session.lastModified || session.timestamp)

  return (
    <Link href={`/project/${projectSlug}/chat/${session.id}`}>
      <Card size="sm" className="cursor-pointer transition-colors hover:bg-accent/50">
        <CardHeader>
          <div className="flex items-start gap-2">
            {session.isActive && (
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-green-500" title="Active" />
            )}
            <div className="min-w-0 flex-1">
              {projectLabel && (
                <p className="mb-0.5 text-[10px] text-muted-foreground">{projectLabel}</p>
              )}
              <CardTitle className="line-clamp-2">{session.firstPrompt}</CardTitle>
              <CardDescription>{timeAgo}</CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={copyCommand}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Copy resume command"
              >
                {copied ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : (
                  <ClipboardIcon className="h-3.5 w-3.5" />
                )}
              </button>
              {onToggleFavorite && (
                <button
                  onClick={handleStar}
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  {isFavorite ? (
                    <StarFilledIcon className="h-3.5 w-3.5 text-yellow-500" />
                  ) : (
                    <StarIcon className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        {!compact && (
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
        )}
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

// Inline SVG icons to avoid adding dependencies

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

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
