"use client"

import type { ContentBlock } from "@/lib/types"
import { ToolUseBlock } from "./tool-use-block"
import { cn } from "@/lib/utils"

export function MessageBubble({
  role,
  content,
  timestamp,
}: {
  role: "user" | "assistant"
  content: ContentBlock[]
  timestamp: string
}) {
  const isUser = role === "user"

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {content.map((block, i) => {
          if (block.type === "text") {
            return (
              <div key={i} className="whitespace-pre-wrap break-words">
                {block.text}
              </div>
            )
          }
          if (block.type === "tool_use") {
            return (
              <ToolUseBlock
                key={i}
                name={block.name}
                input={block.input}
              />
            )
          }
          return null
        })}
        <div
          className={cn(
            "mt-1 text-[10px] opacity-50",
            isUser ? "text-right" : "text-left"
          )}
        >
          {new Date(timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}
