"use client"

import { useEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MessageBubble } from "./message-bubble"
import type { ParsedMessage } from "@/lib/types"

export function ChatView({
  messages,
  isStreaming,
}: {
  messages: ParsedMessage[]
  isStreaming?: boolean
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  return (
    <ScrollArea className="flex-1 overflow-hidden">
      <div className="flex flex-col gap-3 p-4">
        {messages.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-20 text-sm text-muted-foreground">
            No messages yet
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.uuid}
            role={msg.role}
            content={msg.content}
            timestamp={msg.timestamp}
          />
        ))}
        {isStreaming && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground animate-pulse">
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
