import type {
  ParsedMessage,
  SDKMessage,
  ContentBlock,
  ResultBlock,
  SystemEventBlock,
  ToolUseSummaryBlock,
} from "@/lib/types";

export type ToolProgressEntry = {
  toolName: string;
  toolUseId: string;
  startedAt: number;
  elapsed: number;
};

function appendSystemMessage(
  setMessages: React.Dispatch<React.SetStateAction<ParsedMessage[]>>,
  content: ContentBlock[]
) {
  setMessages((prev) => [
    ...prev,
    {
      role: "system" as const,
      content,
      timestamp: new Date().toISOString(),
      uuid: crypto.randomUUID(),
    },
  ]);
}

export function handleSDKMessage(
  msg: SDKMessage,
  setSessionId: (id: string) => void,
  setMessages: React.Dispatch<React.SetStateAction<ParsedMessage[]>>,
  setIsStreaming: (v: boolean) => void,
  setError: (v: string | null) => void,
  streamingRef: React.MutableRefObject<boolean>,
  toolProgressRef: React.MutableRefObject<Map<string, ToolProgressEntry>>,
  bumpProgressTick: () => void,
  setCurrentPermissionMode?: (mode: string) => void
) {
  switch ((msg as { type: string }).type) {
    case "heartbeat": {
      // SSE keep-alive emitted by the server every ~20s while Claude is blocked
      // waiting for user input (e.g. AskUserQuestion). No UI update needed.
      break;
    }
    case "system": {
      const sysMsg = msg as {
        subtype: string;
        session_id?: string;
        message?: string;
        permissionMode?: string;
      };
      if (sysMsg.subtype === "init") {
        setSessionId(sysMsg.session_id!);
        if (setCurrentPermissionMode && sysMsg.permissionMode) {
          setCurrentPermissionMode(sysMsg.permissionMode);
        }
      } else if (
        sysMsg.subtype === "status" ||
        sysMsg.subtype === "compact_boundary"
      ) {
        const detail =
          sysMsg.subtype === "compact_boundary"
            ? "Context compacted"
            : (sysMsg.message ?? sysMsg.subtype);
        appendSystemMessage(setMessages, [
          {
            type: "system_event" as const,
            subtype: sysMsg.subtype,
            message: detail,
          } satisfies SystemEventBlock,
        ]);
      }
      break;
    }

    case "assistant": {
      const assistantMsg = msg as unknown as {
        message: {
          content: Array<{
            type: string;
            id: string;
            name: string;
            text: string;
            thinking: string;
            signature: string;
            data: string;
            input: unknown;
            citations?: unknown;
          }>;
        };
      };
      for (const block of assistantMsg.message.content) {
        if (block.type === "text") {
          setMessages((prev) => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            if (last?.role === "assistant") {
              const lastBlock = last.content[last.content.length - 1];
              if (lastBlock?.type === "text") {
                msgs[msgs.length - 1] = {
                  ...last,
                  content: [
                    ...last.content.slice(0, -1),
                    {
                      type: "text" as const,
                      text: lastBlock.text + block.text,
                      citations: null,
                    },
                  ],
                };
              } else {
                msgs[msgs.length - 1] = {
                  ...last,
                  content: [
                    ...last.content,
                    {
                      type: "text" as const,
                      text: block.text,
                      citations: (block.citations ?? null) as null,
                    },
                  ],
                };
              }
            }
            return msgs;
          });
        } else if (block.type === "thinking") {
          setMessages((prev) => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            if (last?.role === "assistant") {
              msgs[msgs.length - 1] = {
                ...last,
                content: [
                  ...last.content,
                  {
                    type: "thinking" as const,
                    thinking: block.thinking ?? "",
                    signature: block.signature ?? "",
                  },
                ],
              };
            }
            return msgs;
          });
        } else if (block.type === "redacted_thinking") {
          setMessages((prev) => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            if (last?.role === "assistant") {
              msgs[msgs.length - 1] = {
                ...last,
                content: [
                  ...last.content,
                  {
                    type: "redacted_thinking" as const,
                    data: block.data ?? "",
                  },
                ],
              };
            }
            return msgs;
          });
        } else if (block.type === "tool_use") {
          toolProgressRef.current.set(block.id, {
            toolName: block.name,
            toolUseId: block.id,
            startedAt: Date.now(),
            elapsed: 0,
          });
          bumpProgressTick();

          setMessages((prev) => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
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
              };
            }
            return msgs;
          });
        }
      }
      break;
    }

    case "user": {
      const message = (
        msg as {
          message?: {
            content?: Array<{
              type: string;
              tool_use_id?: string;
              content?: string | Array<{ type: string; text: string }>;
              is_error?: boolean;
            }>;
          };
        }
      ).message;
      if (message?.content) {
        for (const block of message.content) {
          if (block.type === "tool_result" && block.tool_use_id) {
            const entry = toolProgressRef.current.get(block.tool_use_id);
            if (entry) {
              entry.elapsed = Date.now() - entry.startedAt;
            }
            toolProgressRef.current.delete(block.tool_use_id);
            bumpProgressTick();

            const output =
              typeof block.content === "string"
                ? block.content
                : Array.isArray(block.content)
                  ? block.content.map((c) => c.text ?? "").join("")
                  : "";
            const elapsed = entry?.elapsed;

            setMessages((prev) => {
              return prev.map((m) => {
                if (m.role !== "assistant") return m;
                const hasToolUse = m.content.some(
                  (c) => c.type === "tool_use" && c.id === block.tool_use_id
                );
                if (!hasToolUse) return m;
                return {
                  ...m,
                  content: m.content.map((c) => {
                    if (c.type === "tool_use" && c.id === block.tool_use_id) {
                      return {
                        ...c,
                        output,
                        is_error: block.is_error ?? false,
                        elapsed,
                      };
                    }
                    return c;
                  }),
                };
              });
            });

            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") return prev;
              return [
                ...prev,
                {
                  role: "assistant" as const,
                  content: [],
                  timestamp: new Date().toISOString(),
                  uuid: crypto.randomUUID(),
                },
              ];
            });
          }
        }
      }
      break;
    }

    case "tool_progress": {
      const toolMsg = msg as { tool_use_id?: string };
      if (toolMsg.tool_use_id) {
        const entry = toolProgressRef.current.get(toolMsg.tool_use_id);
        if (entry) {
          entry.elapsed = Date.now() - entry.startedAt;
          bumpProgressTick();
        }
      }
      break;
    }

    case "result": {
      const resultMsg = msg as {
        cost_usd?: number;
        duration_ms?: number;
        duration_api_ms?: number;
        num_turns?: number;
        total_input_tokens?: number;
        total_output_tokens?: number;
        is_error?: boolean;
        subtype?: string;
      };
      toolProgressRef.current.clear();
      bumpProgressTick();

      appendSystemMessage(setMessages, [
        {
          type: "result" as const,
          costUSD: resultMsg.cost_usd,
          durationMs: resultMsg.duration_ms,
          durationApiMs: resultMsg.duration_api_ms,
          numTurns: resultMsg.num_turns,
          inputTokens: resultMsg.total_input_tokens,
          outputTokens: resultMsg.total_output_tokens,
          isError: resultMsg.is_error,
          subtype: resultMsg.subtype,
        } satisfies ResultBlock,
      ]);

      setIsStreaming(false);
      streamingRef.current = false;
      break;
    }

    case "hook_started":
    case "hook_progress":
    case "hook_response": {
      const hookMsg = msg as {
        type: string;
        hook_name?: string;
        message?: string;
      };
      appendSystemMessage(setMessages, [
        {
          type: "system_event" as const,
          subtype: hookMsg.type,
          message: hookMsg.message ?? `Hook: ${hookMsg.hook_name ?? "unknown"}`,
          detail: hookMsg.hook_name,
        } satisfies SystemEventBlock,
      ]);
      break;
    }

    case "task_started":
    case "task_notification": {
      const taskMsg = msg as {
        type: string;
        description?: string;
        message?: string;
      };
      appendSystemMessage(setMessages, [
        {
          type: "system_event" as const,
          subtype: taskMsg.type,
          message: taskMsg.message ?? taskMsg.description ?? taskMsg.type,
        } satisfies SystemEventBlock,
      ]);
      break;
    }

    case "auth_status": {
      const authMsg = msg as {
        isAuthenticating: boolean;
        output: string[];
        error?: string;
      };
      const message = authMsg.error
        ? `Auth error: ${authMsg.error}`
        : authMsg.output.join("\n");
      appendSystemMessage(setMessages, [
        {
          type: "system_event" as const,
          subtype: "auth_status",
          message,
        } satisfies SystemEventBlock,
      ]);
      break;
    }

    case "tool_use_summary": {
      const sumMsg = msg as {
        tool_name?: string;
        filepath?: string;
        summary?: string;
      };
      appendSystemMessage(setMessages, [
        {
          type: "tool_use_summary" as const,
          toolName: sumMsg.tool_name ?? "unknown",
          filepath: sumMsg.filepath,
          summary: sumMsg.summary,
        } satisfies ToolUseSummaryBlock,
      ]);
      break;
    }
  }
}
