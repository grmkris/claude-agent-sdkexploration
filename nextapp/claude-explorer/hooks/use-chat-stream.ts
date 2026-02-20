"use client"

import { useState, useCallback, useRef } from "react"
import { client } from "@/lib/orpc-client"
import type { ParsedMessage, SDKMessage } from "@/lib/types"

type UseChatStreamReturn = {
  messages: ParsedMessage[]
  send: (prompt: string) => void
  isStreaming: boolean
  sessionId: string | null
  error: string | null
}

export function useChatStream(opts?: {
  resume?: string
  cwd?: string
}): UseChatStreamReturn {
  const [messages, setMessages] = useState<ParsedMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const streamingRef = useRef(false)

  const send = useCallback(
    (prompt: string) => {
      if (streamingRef.current) return
      streamingRef.current = true

      const userMsg: ParsedMessage = {
        role: "user",
        content: [{ type: "text", text: prompt, citations: null }],
        timestamp: new Date().toISOString(),
        uuid: crypto.randomUUID(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsStreaming(true)
      setError(null)

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

      ;(async () => {
        try {
          const iterator = await client.chat({
            prompt,
            resume: opts?.resume ?? sessionId ?? undefined,
            cwd: opts?.cwd,
          })

          for await (const msg of iterator) {
            handleSDKMessage(msg, setSessionId, setMessages, setIsStreaming, setError, streamingRef)
          }

          if (streamingRef.current) {
            setIsStreaming(false)
            streamingRef.current = false
          }
        } catch (err) {
          setError(String(err))
          setIsStreaming(false)
          streamingRef.current = false
        }
      })()
    },
    [sessionId, opts?.resume, opts?.cwd]
  )

  return { messages, send, isStreaming, sessionId, error }
}

function handleSDKMessage(
  msg: SDKMessage,
  setSessionId: (id: string) => void,
  setMessages: React.Dispatch<React.SetStateAction<ParsedMessage[]>>,
  setIsStreaming: (v: boolean) => void,
  setError: (v: string | null) => void,
  streamingRef: React.MutableRefObject<boolean>,
) {
  switch (msg.type) {
    case "system":
      if (msg.subtype === "init") {
        setSessionId(msg.session_id)
      }
      break

    case "assistant":
      for (const block of msg.message.content) {
        if (block.type === "text") {
          setMessages((prev) => {
            const msgs = [...prev]
            const last = msgs[msgs.length - 1]
            if (last?.role === "assistant") {
              const lastBlock = last.content[last.content.length - 1]
              if (lastBlock?.type === "text") {
                msgs[msgs.length - 1] = {
                  ...last,
                  content: [
                    ...last.content.slice(0, -1),
                    { type: "text" as const, text: lastBlock.text + block.text, citations: null },
                  ],
                }
              } else {
                msgs[msgs.length - 1] = {
                  ...last,
                  content: [...last.content, { type: "text" as const, text: block.text, citations: block.citations ?? null }],
                }
              }
            }
            return msgs
          })
        } else if (block.type === "tool_use") {
          setMessages((prev) => {
            const msgs = [...prev]
            const last = msgs[msgs.length - 1]
            if (last?.role === "assistant") {
              msgs[msgs.length - 1] = {
                ...last,
                content: [
                  ...last.content,
                  {
                    type: "tool_use",
                    id: block.id,
                    name: block.name,
                    input: block.input as Record<string, unknown>,
                  },
                ],
              }
            }
            return msgs
          })
        }
      }
      break

    case "result":
      setIsStreaming(false)
      streamingRef.current = false
      break

  }
}
