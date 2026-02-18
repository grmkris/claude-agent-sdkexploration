export type Project = {
  slug: string
  path: string
  sessionCount: number
  lastActive?: string
}

export type SessionMeta = {
  id: string
  firstPrompt: string
  timestamp: string
  model: string
  turns: number
  cost: number
  gitBranch: string
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown>; output?: string; is_error?: boolean }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }

export type ChatMessage = {
  role: "user" | "assistant"
  content: ContentBlock[]
  timestamp: string
  uuid: string
  model?: string
}

// Raw JSONL line types from ~/.claude/projects/<slug>/<uuid>.jsonl
export type RawUserMessage = {
  type: "user"
  uuid: string
  parentUuid: string | null
  timestamp: string
  cwd: string
  gitBranch: string
  version: string
  sessionId: string
  message: {
    role: "user"
    content: Array<{ type: "text"; text: string } | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }>
  }
}

export type RawAssistantMessage = {
  type: "assistant"
  uuid: string
  parentUuid: string
  timestamp: string
  cwd: string
  gitBranch: string
  version: string
  sessionId: string
  requestId: string
  message: {
    model: string
    role: "assistant"
    content: Array<
      | { type: "text"; text: string }
      | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    >
    usage?: {
      input_tokens: number
      output_tokens: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }
}

export type RawJSONLLine =
  | RawUserMessage
  | RawAssistantMessage
  | { type: "queue-operation"; [key: string]: unknown }
  | { type: "file-history-snapshot"; [key: string]: unknown }
  | { type: "progress"; [key: string]: unknown }
  | { type: string; [key: string]: unknown }

// SSE event types for /api/chat
export type SSEEvent =
  | { event: "init"; data: { sessionId: string } }
  | { event: "text"; data: { text: string } }
  | { event: "tool_use"; data: { name: string; input: Record<string, unknown> } }
  | { event: "result"; data: { subtype: string; cost?: number; turns?: number } }
  | { event: "error"; data: { message: string } }
