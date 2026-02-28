"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChatInput } from "@/components/chat-input";
import {
  ChatSettingsBar,
  DEFAULT_CHAT_SETTINGS,
  type ChatSettings,
} from "@/components/chat-settings-bar";
import { ChatView } from "@/components/chat-view";
import { ForkLineageBar } from "@/components/fork-lineage-bar";
import { useChatStream } from "@/hooks/use-chat-stream";
import { orpc } from "@/lib/orpc";
import {
  useRegisterCompact,
  useRegisterSend,
} from "@/lib/session-compact-context";

export default function SessionChatPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}) {
  const { slug, sessionId } = use(params);
  const router = useRouter();

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
    approvePlan,
    isStreaming,
    error,
    toolProgress,
    currentPermissionMode,
  } = useChatStream({
    resume: sessionId,
    cwd: resolved?.path,
    permissionMode: settings.planMode ? "plan" : "bypassPermissions",
    model: settings.model,
  });

  // Register compact callback so the AgentTabBar can trigger it
  useRegisterCompact(sessionId, () => send("/compact"));

  // Register send function so the context tray can send messages to this session
  const sendWhenIdle = useCallback(
    (prompt: string) => {
      if (!isStreaming) send(prompt);
    },
    [isStreaming, send]
  );
  useRegisterSend(sessionId, isStreaming ? undefined : sendWhenIdle);

  // Auto-send prompt injected from the context tray via sessionStorage
  const didAutoSend = useRef(false);
  useEffect(() => {
    if (didAutoSend.current || isLoading || isStreaming || !resolved?.path)
      return;
    const key = `context-tray-inject:${sessionId}`;
    try {
      const injected = sessionStorage.getItem(key);
      if (injected) {
        sessionStorage.removeItem(key);
        didAutoSend.current = true;
        send(injected);
      }
    } catch {}
  }, [sessionId, isLoading, isStreaming, resolved?.path, send]);

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
        `/project/${slug}/chat?_fork=1&parentSessionId=${sessionId}&resumeSessionAt=${messageUuid}&forkSessionId=${forkId}`
      );
    },
    [slug, sessionId, router]
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
      <ForkLineageBar sessionId={sessionId} projectSlug={slug} />
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
        disabled={!resolved?.path}
        storageKey={`${slug}:${sessionId}`}
      />
    </div>
  );
}
