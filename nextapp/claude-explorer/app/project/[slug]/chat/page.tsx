"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useRef, useState } from "react";

import { ChatInput } from "@/components/chat-input";
import {
  ChatSettingsBar,
  DEFAULT_CHAT_SETTINGS,
  type ChatSettings,
} from "@/components/chat-settings-bar";
import { ChatView } from "@/components/chat-view";
import { useChatStream } from "@/hooks/use-chat-stream";
import { orpc } from "@/lib/orpc";

// ── Inner chat component ───────────────────────────────────────────────────────
// Keyed externally on `_new` so the whole component — including useChatStream —
// is torn down and remounted fresh every time "New Conversation" is clicked,
// even when the URL path hasn't changed.

function NewChatContent({
  slug,
  initialPrompt,
}: {
  slug: string;
  initialPrompt?: string;
}) {
  const router = useRouter();
  const { data } = useQuery(
    orpc.projects.resolveSlug.queryOptions({ input: { slug } })
  );

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
  } = useChatStream({
    cwd: data?.path,
    thinking: settings.thinkingEnabled ? "adaptive" : "disabled",
    permissionMode: settings.planMode
      ? "plan"
      : settings.bypassPermissions
        ? "bypassPermissions"
        : "default",
  });

  // Auto-send the initial prompt (from project creation) once the cwd is ready.
  const didAutoSend = useRef(false);
  useEffect(() => {
    if (initialPrompt && data?.path && !didAutoSend.current) {
      didAutoSend.current = true;
      send(initialPrompt);
    }
  }, [initialPrompt, data?.path, send]);

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
        disabled={!data?.path}
        storageKey={`${slug}:new`}
      />
    </div>
  );
}

// ── Search-param reader ────────────────────────────────────────────────────────
// Reads `?_new=<timestamp>` and passes it as a React key to NewChatContent so
// every "New Conversation" click produces a distinct key → full remount.
// Must live inside a <Suspense> boundary because useSearchParams() suspends.

function NewChatPageInner({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const newKey = searchParams.get("_new") ?? "initial";
  const initialPrompt = searchParams.get("prompt") ?? undefined;
  return (
    <NewChatContent key={newKey} slug={slug} initialPrompt={initialPrompt} />
  );
}

// ── Page export ────────────────────────────────────────────────────────────────

export default function NewChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <Suspense>
      <NewChatPageInner slug={slug} />
    </Suspense>
  );
}
