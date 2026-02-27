"use client";

import { useQuery } from "@tanstack/react-query";
import { use, useMemo, useState } from "react";

import { ChatInput } from "@/components/chat-input";
import {
  ChatSettingsBar,
  DEFAULT_CHAT_SETTINGS,
  type ChatSettings,
} from "@/components/chat-settings-bar";
import { ChatView } from "@/components/chat-view";
import { useRootChatStream } from "@/hooks/use-root-chat-stream";
import { orpc } from "@/lib/orpc";

export default function RootSessionChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);

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
    thinking: settings.thinkingEnabled ? "adaptive" : "disabled",
    permissionMode: settings.planMode
      ? "plan"
      : settings.bypassPermissions
        ? "bypassPermissions"
        : "default",
  });

  const allMessages = useMemo(() => {
    if (streamMessages.length === 0) return history ?? [];
    const streamUuids = new Set(streamMessages.map((m) => m.uuid));
    const deduped = (history ?? []).filter((m) => !streamUuids.has(m.uuid));
    return [...deduped, ...streamMessages];
  }, [history, streamMessages]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground animate-pulse">
        Loading session...
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
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
