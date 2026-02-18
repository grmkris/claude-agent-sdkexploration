"use client"

import { useState, useCallback, useRef } from "react"
import type { ContentBlock } from "@/lib/types"

type StreamMessage = {
  role: "user" | "assistant"
  content: ContentBlock[]
  timestamp: string
  uuid: string
}

type UseChatStreamReturn = {
  messages: StreamMessage[]
  send: (prompt: string) => void
  isStreaming: boolean
  sessionId: string | null
  error: string | null
}

export function useChatStream(opts?: {
  resume?: string
  cwd?: string
}): UseChatStreamReturn {
  const [messages, setMessages] = useState<StreamMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const send = useCallback(
    (prompt: string) => {
      if (isStreaming) return

      // Add user message
      const userMsg: StreamMessage = {
        role: "user",
        content: [{ type: "text", text: prompt }],
        timestamp: new Date().toISOString(),
        uuid: crypto.randomUUID(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsStreaming(true)
      setError(null)

      const params = new URLSearchParams({ prompt })
      if (opts?.resume || sessionId) {
        params.set("resume", (opts?.resume || sessionId)!)
      }
      if (opts?.cwd) {
        params.set("cwd", opts.cwd)
      }

      const controller = new AbortController()
      abortRef.current = controller

      // Create placeholder assistant message
      const assistantUuid = crypto.randomUUID()
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: [],
          timestamp: new Date().toISOString(),
          uuid: assistantUuid,
        },
      ])

      const eventSource = new EventSource(`/api/chat?${params.toString()}`)

      eventSource.addEventListener("init", (e) => {
        const data = JSON.parse(e.data)
        setSessionId(data.sessionId)
      })

      eventSource.addEventListener("text", (e) => {
        const data = JSON.parse(e.data)
        setMessages((prev) => {
          const msgs = [...prev]
          const last = msgs[msgs.length - 1]
          if (last?.role === "assistant") {
            const lastContent = last.content
            const lastBlock = lastContent[lastContent.length - 1]
            if (lastBlock?.type === "text") {
              // Append to existing text block
              msgs[msgs.length - 1] = {
                ...last,
                content: [
                  ...lastContent.slice(0, -1),
                  { type: "text", text: lastBlock.text + data.text },
                ],
              }
            } else {
              // New text block
              msgs[msgs.length - 1] = {
                ...last,
                content: [...lastContent, { type: "text", text: data.text }],
              }
            }
          }
          return msgs
        })
      })

      eventSource.addEventListener("tool_use", (e) => {
        const data = JSON.parse(e.data)
        setMessages((prev) => {
          const msgs = [...prev]
          const last = msgs[msgs.length - 1]
          if (last?.role === "assistant") {
            msgs[msgs.length - 1] = {
              ...last,
              content: [
                ...last.content,
                { type: "tool_use", id: crypto.randomUUID(), name: data.name, input: data.input },
              ],
            }
          }
          return msgs
        })
      })

      eventSource.addEventListener("result", () => {
        eventSource.close()
        setIsStreaming(false)
      })

      eventSource.addEventListener("error", (e) => {
        if (e instanceof MessageEvent) {
          const data = JSON.parse(e.data)
          setError(data.message)
        }
        eventSource.close()
        setIsStreaming(false)
      })

      eventSource.onerror = () => {
        eventSource.close()
        setIsStreaming(false)
      }
    },
    [isStreaming, sessionId, opts?.resume, opts?.cwd]
  )

  return { messages, send, isStreaming, sessionId, error }
}
