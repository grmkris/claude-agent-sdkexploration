"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useRef, useState } from "react";

import type { ContextChip } from "@/lib/context-chips";

import { ChatInput } from "@/components/chat-input";
import {
  ChatSettingsBar,
  DEFAULT_CHAT_SETTINGS,
  type ChatSettings,
} from "@/components/chat-settings-bar";
import { ChatView } from "@/components/chat-view";
import { OptionalMcpSelector } from "@/components/optional-mcp-selector";
import { useChatStream } from "@/hooks/use-chat-stream";
import { orpc } from "@/lib/orpc";

// ── Inner chat component ───────────────────────────────────────────────────────
// Keyed externally on `_new` so the whole component — including useChatStream —
// is torn down and remounted fresh every time "New Conversation" is clicked,
// even when the URL path hasn't changed.

type ForkParams = {
  parentSessionId: string;
  resumeSessionAt?: string;
  forkSessionId: string;
};

function NewChatContent({
  slug,
  initialPrompt,
  initialChips,
  forkParams,
}: {
  slug: string;
  initialPrompt?: string;
  initialChips?: ContextChip[];
  forkParams?: ForkParams;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
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
    permissionMode: settings.planMode ? "plan" : "bypassPermissions",
    model: settings.model,
    enabledOptionalMcps: settings.enabledOptionalMcps,
    // Fork params: resume the parent session with fork flags
    ...(forkParams
      ? {
          resume: forkParams.parentSessionId,
          forkSession: true,
          resumeSessionAt: forkParams.resumeSessionAt,
          forkSessionId: forkParams.forkSessionId,
        }
      : {}),
  });

  // Auto-fork: send empty prompt to establish the forked session without
  // injecting a visible user message (uses the synthetic message path).
  const didAutoFork = useRef(false);
  useEffect(() => {
    if (forkParams && data?.path && !didAutoFork.current) {
      didAutoFork.current = true;
      send("", undefined, data.path);
    }
  }, [forkParams, data?.path, send]);

  // Auto-send the initial prompt (from project creation) once the cwd is ready.
  // Pass data.path directly as cwdOverride so the correct project directory is
  // used even if opts.cwd was still undefined when useChatStream initialised.
  const didAutoSend = useRef(false);
  useEffect(() => {
    if (initialPrompt && !forkParams && data?.path && !didAutoSend.current) {
      didAutoSend.current = true;
      send(initialPrompt, undefined, data.path);
    }
  }, [initialPrompt, data?.path, send]);

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
      >
        <OptionalMcpSelector
          slug={slug}
          settings={settings}
          onSettingsChange={setSettings}
          disabled={isStreaming}
        />
      </ChatSettingsBar>
      <ChatInput
        onSend={send}
        onStop={stop}
        isStreaming={isStreaming}
        disabled={!data?.path}
        storageKey={`${slug}:new`}
        initialChips={initialChips}
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
  const newKey =
    searchParams.get("_new") ?? searchParams.get("_fork") ?? "initial";
  const initialPrompt = searchParams.get("prompt") ?? undefined;

  // Context chips from query string (e.g. from "Ask Claude" file viewer button)
  const chipsParam = searchParams.get("chips");
  let initialChips: ContextChip[] | undefined;
  if (chipsParam) {
    try {
      initialChips = (
        JSON.parse(decodeURIComponent(chipsParam)) as Partial<ContextChip>[]
      ).map((c) => ({ ...c, id: crypto.randomUUID() }) as ContextChip);
    } catch {
      // ignore malformed chips param
    }
  }

  // Fork params from query string
  const isFork = searchParams.get("_fork") === "1";
  const parentSessionId = searchParams.get("parentSessionId");
  const resumeSessionAt = searchParams.get("resumeSessionAt") ?? undefined;
  const forkSessionId = searchParams.get("forkSessionId");

  const forkParams: ForkParams | undefined =
    isFork && parentSessionId && forkSessionId
      ? { parentSessionId, resumeSessionAt, forkSessionId }
      : undefined;

  return (
    <NewChatContent
      key={newKey}
      slug={slug}
      initialPrompt={initialPrompt}
      initialChips={initialChips}
      forkParams={forkParams}
    />
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
