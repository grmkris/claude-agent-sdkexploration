"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { use, useCallback, useMemo, useState } from "react";

import { ChatInput } from "@/components/chat-input";
import {
  ChatSettingsBar,
  DEFAULT_CHAT_SETTINGS,
  type ChatSettings,
} from "@/components/chat-settings-bar";
import { ChatView } from "@/components/chat-view";
import { ForkLineageBar } from "@/components/fork-lineage-bar";
import { useRootChatStream } from "@/hooks/use-root-chat-stream";
import { orpc } from "@/lib/orpc";
import { useRegisterCompact } from "@/lib/session-compact-context";

export default function RootSessionChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const router = useRouter();

  const {
    data: history,
    isLoading,
    refetch,
  } = useQuery({
    ...orpc.root.messages.queryOptions({ input: { sessionId } }),
    refetchInterval: false,
  });

  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_CHAT_SETTINGS);

  const {
    messages: streamMessages,
    send,
    stop,
    answerQuestion,
    approvePlan,
    isStreaming,
    error,
    toolProgress,
    currentPermissionMode,
  } = useRootChatStream({
    resume: sessionId,
    permissionMode: settings.planMode ? "plan" : "bypassPermissions",
    model: settings.model,
  });

  // Register compact callback so the AgentTabBar can trigger it
  useRegisterCompact(sessionId, () => send("/compact"));

  const allMessages = useMemo(() => {
    if (streamMessages.length === 0) return history ?? [];
    const streamUuids = new Set(streamMessages.map((m) => m.uuid));
    const deduped = (history ?? []).filter((m) => !streamUuids.has(m.uuid));
    return [...deduped, ...streamMessages];
  }, [history, streamMessages]);

  const handleFork = useCallback(
    (messageUuid: string) => {
      const forkId = crypto.randomUUID();
      router.push(
        `/chat?_fork=1&parentSessionId=${sessionId}&resumeSessionAt=${messageUuid}&forkSessionId=${forkId}`
      );
    },
    [sessionId, router]
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground animate-pulse">
        Loading session...
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ForkLineageBar sessionId={sessionId} projectSlug="__root__" />
      <ChatView
        messages={allMessages}
        isStreaming={
          isStreaming &&
          streamMessages.length > 0 &&
          streamMessages[streamMessages.length - 1]?.content.length === 0
        }
        toolProgress={toolProgress}
        projectSlug="__root__"
        sessionId={sessionId}
        onRefresh={() => refetch()}
        onAnswer={answerQuestion}
        onApprovePlan={approvePlan}
        onFork={handleFork}
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
        storageKey={`__root__:${sessionId}`}
      />
    </div>
  );
}
