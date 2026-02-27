"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { ChatInput } from "@/components/chat-input";
import {
  ChatSettingsBar,
  DEFAULT_CHAT_SETTINGS,
  type ChatSettings,
} from "@/components/chat-settings-bar";
import { ChatView } from "@/components/chat-view";
import { useRootChatStream } from "@/hooks/use-root-chat-stream";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";

const ONBOARD_PROMPT =
  "Introduce yourself briefly. What can you help me with in this workspace? List a few practical things I can ask you to do.";

function RootNewChatContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_CHAT_SETTINGS);

  const {
    messages,
    send,
    stop,
    answerQuestion,
    approvePlan,
    isStreaming,
    sessionId,
    error,
    toolProgress,
    currentPermissionMode,
  } = useRootChatStream({
    thinking: settings.thinkingEnabled ? "adaptive" : "disabled",
    permissionMode: settings.planMode
      ? "plan"
      : settings.bypassPermissions
        ? "bypassPermissions"
        : "default",
  });

  const setPrimary = useMutation({
    mutationFn: (id: string) => client.root.setPrimary({ sessionId: id }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orpc.root.primarySession.queryOptions().queryKey,
      }),
  });

  // Auto-send onboard prompt
  const didAutoSend = useRef(false);
  useEffect(() => {
    if (searchParams.get("onboard") && !didAutoSend.current && !isStreaming) {
      didAutoSend.current = true;
      send(ONBOARD_PROMPT);
    }
  }, [searchParams, isStreaming]);

  // Eagerly refresh the sidebar / active-sessions list as soon as the new
  // session ID is known — don't wait for the SSE polling interval.
  const didInvalidate = useRef(false);
  useEffect(() => {
    if (sessionId && !didInvalidate.current) {
      didInvalidate.current = true;
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          if (Array.isArray(key) && key.length >= 1) {
            if (key[0] === "liveState") return true;
          }
          if (Array.isArray(key) && key.length >= 2) {
            if (key[0] === "sessions") return true;
            if (key[0] === "root" && key[1] === "sessions") return true;
          }
          return false;
        },
      });
    }
  }, [sessionId, queryClient]);

  // Auto-set as primary if no primary exists
  const didSetPrimary = useRef(false);
  useEffect(() => {
    if (sessionId && !didSetPrimary.current) {
      didSetPrimary.current = true;
      void (async () => {
        const current = await client.root.primarySession();
        if (!current.sessionId) {
          setPrimary.mutate(sessionId);
        }
      })();
    }
  }, [sessionId]);

  // Once the first stream completes, redirect to the canonical session URL.
  // This keeps /chat always a blank slate, so starting a new conversation
  // always forces a full component remount with fresh state.
  const didRedirect = useRef(false);
  useEffect(() => {
    if (sessionId && !isStreaming && !didRedirect.current) {
      didRedirect.current = true;
      router.replace(`/chat/${sessionId}`);
    }
  }, [sessionId, isStreaming, router]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ChatView
        messages={messages}
        isStreaming={
          isStreaming &&
          messages.length > 0 &&
          messages[messages.length - 1]?.content.length === 0
        }
        toolProgress={toolProgress}
        projectSlug="__root__"
        sessionId={sessionId}
        onAnswer={answerQuestion}
        onApprovePlan={approvePlan}
        onCompact={() => send("/compact")}
      />
      {error && (
        <div className="mx-4 mb-2 rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <ChatSettingsBar
        settings={settings}
        onSettingsChange={setSettings}
        disabled={isStreaming}
        currentPermissionMode={currentPermissionMode}
      />
      <ChatInput
        onSend={send}
        onStop={stop}
        isStreaming={isStreaming}
        storageKey="__root__:new"
      />
    </div>
  );
}

export default function RootNewChatPage() {
  return (
    <Suspense>
      <RootNewChatContent />
    </Suspense>
  );
}
