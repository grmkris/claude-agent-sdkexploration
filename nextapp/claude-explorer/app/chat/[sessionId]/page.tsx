"use client";

import { useQuery } from "@tanstack/react-query";
import { use, useMemo } from "react";

import { ChatInput } from "@/components/chat-input";
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

  const {
    messages: streamMessages,
    send,
    stop,
    isStreaming,
    error,
    toolProgress,
  } = useRootChatStream({
    resume: sessionId,
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
      />
      {error && (
        <div className="mx-4 mb-2 rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <ChatInput onSend={send} onStop={stop} isStreaming={isStreaming} />
    </div>
  );
}
