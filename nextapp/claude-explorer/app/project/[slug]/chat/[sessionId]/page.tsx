"use client"

import { use, useEffect, useState } from "react"
import { ChatView } from "@/components/chat-view"
import { ChatInput } from "@/components/chat-input"
import { useChatStream } from "@/hooks/use-chat-stream"
import type { ChatMessage } from "@/lib/types"

export default function SessionChatPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>
}) {
  const { slug, sessionId } = use(params)
  const cwd = slug.replace(/-/g, "/")

  const [history, setHistory] = useState<ChatMessage[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const { messages: streamMessages, send, isStreaming, error } = useChatStream({
    resume: sessionId,
    cwd,
  })

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}/messages?project=${slug}`)
      .then((r) => r.json())
      .then((data) => {
        setHistory(data)
        setHistoryLoaded(true)
      })
      .catch(() => setHistoryLoaded(true))
  }, [sessionId, slug])

  const allMessages = [...history, ...streamMessages]

  if (!historyLoaded) {
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
