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
import { useChatStream } from "@/hooks/use-chat-stream";
import { orpc } from "@/lib/orpc";

export default function SessionChatPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}) {
  const { slug, sessionId } = use(params);

  const { data: resolved } = useQuery(
    orpc.projects.resolveSlug.queryOptions({ input: { slug } })
  );

  const {
    data: history,
    isLoading,
    refetch,
  } = useQuery({
    ...orpc.sessions.messages.queryOptions({ input: { slug, sessionId } }),
    refetchInterval: false,
  });

  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_CHAT_SETTINGS);

  const {
    messages: streamMessages,
    send,
    stop,
    answerQuestion,
    isStreaming,
    error,
    toolProgress,
  } = useChatStream({
    resume: sessionId,
    cwd: resolved?.path,
    thinking: settings.thinkingEnabled ? "adaptive" : "disabled",
    permissionMode: settings.bypassPermissions
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
        projectSlug={slug}
        sessionId={sessionId}
        onRefresh={() => refetch()}
        onAnswer={answerQuestion}
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
      />
      <ChatInput
        onSend={send}
        onStop={stop}
        isStreaming={isStreaming}
        disabled={!resolved?.path}
        storageKey={`${slug}:${sessionId}`}
      />
    </div>
  );
}
