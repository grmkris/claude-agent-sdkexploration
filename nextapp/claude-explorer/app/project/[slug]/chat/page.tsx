"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef } from "react";

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
  const router = useRouter();
  const { data } = useQuery(
    orpc.projects.resolveSlug.queryOptions({ input: { slug } })
  );
  const { messages, send, stop, isStreaming, sessionId, error, toolProgress } =
    useChatStream({
      cwd: data?.path,
    });

  // Once the first stream completes, redirect to the canonical session URL.
  // This keeps /project/[slug]/chat always a blank slate, so clicking
  // "+ New" from a session page always hits a different URL and forces
  // a full component remount with fresh useChatStream state.
  const didRedirect = useRef(false);
  useEffect(() => {
    if (sessionId && !isStreaming && !didRedirect.current) {
      didRedirect.current = true;
      router.replace(`/project/${slug}/chat/${sessionId}`);
    }
  }, [sessionId, isStreaming, slug, router]);

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
        sessionId={sessionId}
      />
      {error && (
        <div className="mx-4 mb-2 rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <ChatInput
        onSend={send}
        onStop={stop}
        isStreaming={isStreaming}
        disabled={!data?.path}
        storageKey={`${slug}:new`}
      />
    </div>
  );
}
