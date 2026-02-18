"use client"

import { use } from "react"
import { ChatView } from "@/components/chat-view"
import { ChatInput } from "@/components/chat-input"
import { useChatStream } from "@/hooks/use-chat-stream"

export default function NewChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const cwd = slug.replace(/-/g, "/")
  const { messages, send, isStreaming, error } = useChatStream({ cwd })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ChatView
        messages={messages}
        isStreaming={isStreaming && messages.length > 0 && messages[messages.length - 1]?.content.length === 0}
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
