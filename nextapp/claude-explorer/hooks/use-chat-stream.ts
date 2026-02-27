"use client";

import { useState, useCallback, useRef } from "react";

import type {
  AttachedImage,
  ContentBlock,
  ParsedMessage,
  UserImageBlock,
} from "@/lib/types";

import { client } from "@/lib/orpc-client";

import type { ToolProgressEntry } from "./sdk-message-handler";

import { handleSDKMessage } from "./sdk-message-handler";

export type { ToolProgressEntry };

type UseChatStreamReturn = {
  messages: ParsedMessage[];
  send: (prompt: string, images?: AttachedImage[]) => void;
  stop: () => void;
  answerQuestion: (
    toolUseId: string,
    answers: Record<string, string[]>
  ) => Promise<void>;
  isStreaming: boolean;
  sessionId: string | null;
  error: string | null;
  toolProgress: Map<string, ToolProgressEntry>;
  currentPermissionMode: string | null;
};

export type ChatStreamOpts = {
  resume?: string;
  cwd?: string;
  thinking?: "adaptive" | "disabled";
  permissionMode?:
    | "bypassPermissions"
    | "default"
    | "acceptEdits"
    | "plan"
    | "dontAsk";
};

export function useChatStream(opts?: ChatStreamOpts): UseChatStreamReturn {
  const [messages, setMessages] = useState<ParsedMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPermissionMode, setCurrentPermissionMode] = useState<
    string | null
  >(null);
  const [, setProgressTick] = useState(0);
  const streamingRef = useRef(false);
  const toolProgressRef = useRef<Map<string, ToolProgressEntry>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    streamingRef.current = false;
  }, []);

  const send = useCallback(
    (prompt: string, images?: AttachedImage[]) => {
      if (streamingRef.current) return;
      streamingRef.current = true;
      toolProgressRef.current.clear();

      const ac = new AbortController();
      abortRef.current = ac;

      // Build optimistic content blocks: images first, then text
      const userContent: ContentBlock[] = [
        ...(images ?? []).map(
          (img): UserImageBlock => ({
            type: "user_image",
            dataUrl: img.dataUrl,
          })
        ),
        { type: "text", text: prompt, citations: null },
      ];

      const userMsg: ParsedMessage = {
        role: "user",
        content: userContent,
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
          const iterator = await client.chat(
            {
              prompt,
              resume: opts?.resume ?? sessionId ?? undefined,
              cwd: opts?.cwd,
              images: images?.map((img) => ({
                base64: img.base64,
                mediaType: img.mediaType,
              })),
              ...(opts?.thinking ? { thinking: opts.thinking } : {}),
              ...(opts?.permissionMode
                ? { permissionMode: opts.permissionMode }
                : {}),
            },
            { signal: ac.signal }
          );

          for await (const msg of iterator) {
            handleSDKMessage(
              msg,
              setSessionId,
              setMessages,
              setIsStreaming,
              setError,
              streamingRef,
              toolProgressRef,
              () => setProgressTick((t) => t + 1),
              setCurrentPermissionMode
            );
          }

          if (streamingRef.current) {
            setIsStreaming(false);
            streamingRef.current = false;
          }
        } catch (err) {
          if (ac.signal.aborted) return;
          setError(String(err));
          setIsStreaming(false);
          streamingRef.current = false;
        }
      })();
    },
    [sessionId, opts?.resume, opts?.cwd, opts?.thinking, opts?.permissionMode]
  );

  const answerQuestion = useCallback(
    async (toolUseId: string, answers: Record<string, string[]>) => {
      if (!sessionId) return;
      const result = await client.answerQuestion({
        sessionId,
        toolUseId,
        answers,
      });
      if (result.needsResume) {
        // Server was restarted — the in-memory promise is gone but pre-filled
        // answers were stored to DB. Trigger a resume stream so canUseTool fires
        // again with those stored answers, which auto-resolves immediately.
        send(" ");
      }
    },
    [sessionId, send]
  );

  return {
    messages,
    send,
    stop,
    answerQuestion,
    isStreaming,
    sessionId,
    error,
    toolProgress: toolProgressRef.current,
    currentPermissionMode,
  };
}
