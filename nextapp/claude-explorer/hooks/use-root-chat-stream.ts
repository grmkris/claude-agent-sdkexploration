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

type UseRootChatStreamReturn = {
  messages: ParsedMessage[];
  send: (prompt: string, images?: AttachedImage[]) => void;
  stop: () => void;
  answerQuestion: (
    toolUseId: string,
    answers: Record<string, string[]>
  ) => Promise<void>;
  approvePlan: (
    toolUseId: string,
    approved: boolean,
    feedback?: string
  ) => Promise<void>;
  isStreaming: boolean;
  sessionId: string | null;
  error: string | null;
  toolProgress: Map<string, ToolProgressEntry>;
  currentPermissionMode: string | null;
};

export type RootChatStreamOpts = {
  resume?: string;
  thinking?: "adaptive" | "disabled";
  permissionMode?:
    | "bypassPermissions"
    | "default"
    | "acceptEdits"
    | "plan"
    | "dontAsk";
};

export function useRootChatStream(
  opts?: RootChatStreamOpts
): UseRootChatStreamReturn {
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

      setIsStreaming(true);
      setError(null);

      // Only render optimistic UI bubbles for real user messages — skip them
      // for resume-only pings (empty prompt) so no blank bubbles appear.
      if (prompt.trim()) {
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

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: [],
            timestamp: new Date().toISOString(),
            uuid: crypto.randomUUID(),
          },
        ]);
      }

      void (async () => {
        try {
          const iterator = await client.rootChat(
            {
              prompt,
              resume: opts?.resume ?? sessionId ?? undefined,
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
    [sessionId, opts?.resume, opts?.thinking, opts?.permissionMode]
  );

  const answerQuestion = useCallback(
    async (toolUseId: string, answers: Record<string, string[]>) => {
      const effectiveSessionId = sessionId ?? opts?.resume ?? null;
      if (!effectiveSessionId) {
        throw new Error(
          "Session not yet initialized. Please wait a moment and try again."
        );
      }
      const result = await client.answerQuestion({
        sessionId: effectiveSessionId,
        toolUseId,
        answers,
      });
      if (result.needsResume) {
        // Server was restarted or SSE stream died — the in-memory promise is
        // gone but pre-filled answers were stored to DB. Trigger a resume stream
        // so canUseTool fires again with those stored answers, which auto-resolves.
        send("");
      } else if (result.success && !streamingRef.current) {
        // The answer was accepted (promise resolved) but the SSE stream has
        // already ended on our end (e.g. connection dropped after the promise
        // resolved). Resume so we don't silently lose the agent's response.
        send("");
      }
    },
    [sessionId, opts?.resume, send, streamingRef]
  );

  const approvePlan = useCallback(
    async (toolUseId: string, approved: boolean, feedback?: string) => {
      const effectiveSessionId = sessionId ?? opts?.resume ?? null;
      if (!effectiveSessionId) return;
      const result = await client.approvePlan({
        sessionId: effectiveSessionId,
        toolUseId,
        approved,
        feedback,
      });
      if (approved) {
        // Optimistically update the permission mode badge — ExitPlanMode approval
        // transitions the session from "plan" to "default" mode.
        setCurrentPermissionMode("default");
      }
      if (result.needsResume) {
        // SSE stream died before approval arrived — trigger a resume stream so
        // the agent can re-ask for plan approval with a fresh connection.
        send("");
      } else if (result.success && !streamingRef.current) {
        // Approval was accepted but our SSE stream already ended locally.
        // Resume so we don't silently lose the agent's continued output.
        send("");
      }
    },
    [sessionId, opts?.resume, send, stop, streamingRef]
  );

  return {
    messages,
    send,
    stop,
    answerQuestion,
    approvePlan,
    isStreaming,
    sessionId,
    error,
    toolProgress: toolProgressRef.current,
    currentPermissionMode,
  };
}
