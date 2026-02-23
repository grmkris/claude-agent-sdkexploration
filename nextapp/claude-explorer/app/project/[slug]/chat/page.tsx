"use client";

import { useQuery } from "@tanstack/react-query";
import { use } from "react";

import { ChatInput } from "@/components/chat-input";
import { ChatView } from "@/components/chat-view";
import { useChatStream } from "@/hooks/use-chat-stream";
import { orpc } from "@/lib/orpc";

export default function NewChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { data } = useQuery(
    orpc.projects.resolveSlug.queryOptions({ input: { slug } })
  );
  const { messages, send, isStreaming, error, toolProgress } = useChatStream({
    cwd: data?.path,
  });

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
        projectSlug={slug}
      />
      {error && (
        <div className="mx-4 mb-2 rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <ChatInput onSend={send} disabled={isStreaming || !data?.path} />
    </div>
  );
}
