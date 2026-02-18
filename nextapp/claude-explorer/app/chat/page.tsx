"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useState, Suspense } from "react"
import { ChatView } from "@/components/chat-view"
import { ChatInput } from "@/components/chat-input"
import { useChatStream } from "@/hooks/use-chat-stream"
import type { ChatMessage } from "@/lib/types"

function ChatContent() {
  const searchParams = useSearchParams()
  const projectSlug = searchParams.get("project")
  const sessionId = searchParams.get("session")

  const [history, setHistory] = useState<ChatMessage[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(!sessionId)

  const { messages: streamMessages, send, isStreaming, error } = useChatStream({
    resume: sessionId ?? undefined,
    cwd: projectSlug ? projectSlug.replace(/-/g, "/") : undefined,
  })

  // Load existing session history
  useEffect(() => {
    if (!sessionId || !projectSlug) return
    fetch(`/api/sessions/${sessionId}/messages?project=${projectSlug}`)
      .then((r) => r.json())
      .then((data) => {
        setHistory(data)
        setHistoryLoaded(true)
      })
      .catch(() => setHistoryLoaded(true))
  }, [sessionId, projectSlug])

  const allMessages = [...history, ...streamMessages]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {!historyLoaded ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground animate-pulse">
          Loading session...
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground animate-pulse">Loading...</div>}>
      <ChatContent />
    </Suspense>
  )
}
