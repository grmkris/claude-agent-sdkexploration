"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { ChatInput } from "@/components/chat-input";
import { ChatView } from "@/components/chat-view";
import { useRootChatStream } from "@/hooks/use-root-chat-stream";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";

const ONBOARD_PROMPT =
  "Introduce yourself briefly. What can you help me with in this workspace? List a few practical things I can ask you to do.";

function RootNewChatContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { messages, send, stop, isStreaming, sessionId, error, toolProgress } =
    useRootChatStream();

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
