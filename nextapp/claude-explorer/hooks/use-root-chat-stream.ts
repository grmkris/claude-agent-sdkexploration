"use client";

import { useState, useCallback, useRef } from "react";

import type { ParsedMessage } from "@/lib/types";

import { client } from "@/lib/orpc-client";

import type { ToolProgressEntry } from "./sdk-message-handler";

import { handleSDKMessage } from "./sdk-message-handler";

export type { ToolProgressEntry };

type UseRootChatStreamReturn = {
  messages: ParsedMessage[];
  send: (prompt: string) => void;
  isStreaming: boolean;
  sessionId: string | null;
  error: string | null;
  toolProgress: Map<string, ToolProgressEntry>;
};

export function useRootChatStream(opts?: {
  resume?: string;
}): UseRootChatStreamReturn {
  const [messages, setMessages] = useState<ParsedMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setProgressTick] = useState(0);
  const streamingRef = useRef(false);
  const toolProgressRef = useRef<Map<string, ToolProgressEntry>>(new Map());

  const send = useCallback(
    (prompt: string) => {
      if (streamingRef.current) return;
      streamingRef.current = true;
      toolProgressRef.current.clear();

      const userMsg: ParsedMessage = {
        role: "user",
        content: [{ type: "text", text: prompt, citations: null }],
        timestamp: new Date().toISOString(),
        uuid: crypto.randomUUID(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setError(null);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: [],
          timestamp: new Date().toISOString(),
          uuid: crypto.randomUUID(),
        },
      ]);

      void (async () => {
        try {
          const iterator = await client.rootChat({
            prompt,
            resume: opts?.resume ?? sessionId ?? undefined,
          });

          for await (const msg of iterator) {
            handleSDKMessage(
              msg,
              setSessionId,
              setMessages,
              setIsStreaming,
              setError,
              streamingRef,
              toolProgressRef,
              () => setProgressTick((t) => t + 1)
            );
          }

          if (streamingRef.current) {
            setIsStreaming(false);
            streamingRef.current = false;
          }
        } catch (err) {
          setError(String(err));
          setIsStreaming(false);
          streamingRef.current = false;
        }
      })();
    },
    [sessionId, opts?.resume]
  );

  return {
    messages,
    send,
    isStreaming,
    sessionId,
    error,
    toolProgress: toolProgressRef.current,
  };
}
