"use client"

import { use } from "react"
import { useQuery } from "@tanstack/react-query"
import { ChatView } from "@/components/chat-view"
import { ChatInput } from "@/components/chat-input"
import { useChatStream } from "@/hooks/use-chat-stream"
import { orpc } from "@/lib/orpc"

export default function SessionChatPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>
}) {
  const { slug, sessionId } = use(params)
  const cwd = slug.replace(/-/g, "/")

  const { data: history, isLoading } = useQuery(
    orpc.sessions.messages.queryOptions({ input: { slug, sessionId } })
  )

  const { messages: streamMessages, send, isStreaming, error } = useChatStream({
    resume: sessionId,
    cwd,
  })

  const allMessages = [...(history ?? []), ...streamMessages]

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground animate-pulse">
        Loading session...
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ChatView
        messages={allMessages}
        isStreaming={isStreaming && streamMessages.length > 0 && streamMessages[streamMessages.length - 1]?.content.length === 0}
      />
      {error && (
        <div className="mx-4 mb-2 rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <ChatInput onSend={send} disabled={isStreaming} />
    </div>
  )
}
