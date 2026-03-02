import type {
  ParsedMessage,
  SDKMessage,
  SessionInitMeta,
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
  setCurrentPermissionMode?: (mode: string) => void,
  setSessionMeta?: (meta: SessionInitMeta) => void
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
        mcp_servers?: Array<{ name: string; status: string }>;
        slash_commands?: string[];
        skills?: string[];
        tools?: string[];
        cwd?: string;
        claude_code_version?: string;
        model?: string;
      };
      if (sysMsg.subtype === "init") {
        setSessionId(sysMsg.session_id!);
        if (setCurrentPermissionMode && sysMsg.permissionMode) {
          setCurrentPermissionMode(sysMsg.permissionMode);
        }
        if (setSessionMeta) {
          setSessionMeta({
            mcpServers: sysMsg.mcp_servers ?? [],
            slashCommands: sysMsg.slash_commands ?? [],
            skills: sysMsg.skills ?? [],
            tools: sysMsg.tools ?? [],
            cwd: sysMsg.cwd ?? "",
            claudeCodeVersion: sysMsg.claude_code_version ?? "",
            model: sysMsg.model ?? "",
          });
        }
      } else if (sysMsg.subtype === "compact_boundary") {
        const compactMsg = msg as {
          subtype: "compact_boundary";
          compact_metadata?: { trigger: "manual" | "auto"; pre_tokens: number };
        };
        const meta = compactMsg.compact_metadata;
        appendSystemMessage(setMessages, [
          {
            type: "system_event" as const,
            subtype: "compact_boundary",
            message: "Context compacted",
            ...(meta
              ? {
                  compactMetadata: {
                    trigger: meta.trigger,
                    preTokens: meta.pre_tokens,
                  },
                }
              : {}),
          } satisfies SystemEventBlock,
        ]);
      } else if (sysMsg.subtype === "status") {
        appendSystemMessage(setMessages, [
          {
            type: "system_event" as const,
            subtype: sysMsg.subtype,
            message: sysMsg.message ?? sysMsg.subtype,
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
        modelUsage?: Record<
          string,
          { contextWindow?: number; maxOutputTokens?: number }
        >;
      };
      toolProgressRef.current.clear();
      bumpProgressTick();

      // Extract context window info from per-model usage breakdown
      let contextWindow: number | undefined;
      let maxContextWindow: number | undefined;
      if (resultMsg.modelUsage) {
        const values = Object.values(resultMsg.modelUsage);
        const cw = values
          .map((u) => u.contextWindow ?? 0)
          .reduce((a, b) => Math.max(a, b), 0);
        const mw = values
          .map((u) => u.maxOutputTokens ?? 0)
          .reduce((a, b) => Math.max(a, b), 0);
        if (cw > 0) contextWindow = cw;
        if (mw > 0) maxContextWindow = mw;
      }

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
          contextWindow,
          maxContextWindow,
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
      const newBlock: ToolUseSummaryBlock = {
        type: "tool_use_summary" as const,
        toolName: sumMsg.tool_name ?? "unknown",
        filepath: sumMsg.filepath,
        summary: sumMsg.summary,
      };
      // Append to the last system message if it only contains tool_use_summary blocks,
      // otherwise create a new system message. This groups summaries into one row.
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (
          last &&
          last.role === "system" &&
          last.content.length > 0 &&
          last.content.every((b) => b.type === "tool_use_summary")
        ) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: [...last.content, newBlock] },
          ];
        }
        return [
          ...prev,
          {
            role: "system" as const,
            content: [newBlock],
            timestamp: new Date().toISOString(),
            uuid: crypto.randomUUID(),
          },
        ];
      });
      break;
    }
  }
}
