"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ContextChip } from "@/lib/context-chips";

import { ChatInput } from "@/components/chat-input";
import {
  ChatSettingsBar,
  DEFAULT_CHAT_SETTINGS,
  type ChatSettings,
} from "@/components/chat-settings-bar";
import { ChatView } from "@/components/chat-view";
import { ForkLineageBar } from "@/components/fork-lineage-bar";
import { OptionalMcpSelector } from "@/components/optional-mcp-selector";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useRootChatStream } from "@/hooks/use-root-chat-stream";
import { orpc } from "@/lib/orpc";
import {
  useRegisterCompact,
  useRegisterSend,
} from "@/lib/session-compact-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ForkParams = {
  parentSessionId: string;
  resumeSessionAt?: string;
  forkSessionId: string;
};

export type SessionPaneProps = {
  /** Session ID to resume. null = new session. */
  sessionId: string | null;
  /** Project slug. undefined = root session. */
  projectSlug?: string;
  /** Whether this pane is focused in the workspace. */
  isFocused?: boolean;
  /** Called when a new session gets its ID from the stream init message. */
  onSessionCreated?: (sessionId: string) => void;
  /** Called when the user forks a message. */
  onFork?: (sessionId: string, messageUuid: string) => void;
  /** Initial prompt for new sessions (e.g. from project creation). */
  initialPrompt?: string;
  /** Initial context chips (e.g. from "Ask Claude" button). */
  initialChips?: ContextChip[];
  /** Fork params for forked sessions. */
  forkParams?: ForkParams;
};

// ---------------------------------------------------------------------------
// Inner components for project vs root sessions
// ---------------------------------------------------------------------------

function ProjectSessionPane({
  sessionId,
  projectSlug,
  isFocused: _isFocused,
  onSessionCreated,
  onFork,
  initialPrompt,
  initialChips,
  forkParams,
}: SessionPaneProps & { projectSlug: string }) {
  const queryClient = useQueryClient();
  const isNewSession = sessionId === null;

  const { data: resolved } = useQuery(
    orpc.projects.resolveSlug.queryOptions({ input: { slug: projectSlug } })
  );

  const {
    data: history,
    isLoading: historyLoading,
    refetch,
  } = useQuery({
    ...orpc.sessions.messages.queryOptions({
      input: { slug: projectSlug, sessionId: sessionId! },
    }),
    enabled: !!sessionId,
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
    sessionId: streamSessionId,
    error,
    toolProgress,
    currentPermissionMode,
  } = useChatStream({
    ...(sessionId ? { resume: sessionId } : {}),
    cwd: resolved?.path,
    permissionMode: settings.planMode ? "plan" : "bypassPermissions",
    model: settings.model,
    enabledOptionalMcps: settings.enabledOptionalMcps,
    ...(forkParams
      ? {
          resume: forkParams.parentSessionId,
          forkSession: true,
          resumeSessionAt: forkParams.resumeSessionAt,
          forkSessionId: forkParams.forkSessionId,
        }
      : {}),
  });

  const effectiveSessionId = streamSessionId ?? sessionId;

  // Register compact callback
  useRegisterCompact(
    effectiveSessionId ?? "",
    effectiveSessionId ? () => send("/compact") : undefined
  );

  // Register send function for context tray
  const sendWhenIdle = useCallback(
    (prompt: string) => {
      if (!isStreaming) send(prompt);
    },
    [isStreaming, send]
  );
  useRegisterSend(
    effectiveSessionId ?? "",
    effectiveSessionId && !isStreaming ? sendWhenIdle : undefined
  );

  // Auto-send from context tray injection
  const didAutoSend = useRef(false);
  useEffect(() => {
    if (
      !effectiveSessionId ||
      didAutoSend.current ||
      historyLoading ||
      isStreaming ||
      !resolved?.path
    )
      return;
    const key = `context-tray-inject:${effectiveSessionId}`;
    try {
      const injected = sessionStorage.getItem(key);
      if (injected) {
        sessionStorage.removeItem(key);
        didAutoSend.current = true;
        send(injected);
      }
    } catch {}
  }, [effectiveSessionId, historyLoading, isStreaming, resolved?.path, send]);

  // Auto-fork: send empty prompt to establish forked session
  const didAutoFork = useRef(false);
  useEffect(() => {
    if (forkParams && resolved?.path && !didAutoFork.current) {
      didAutoFork.current = true;
      send("", undefined, resolved.path);
    }
  }, [forkParams, resolved?.path, send]);

  // Auto-send initial prompt
  const didAutoInitial = useRef(false);
  useEffect(() => {
    if (
      initialPrompt &&
      !forkParams &&
      resolved?.path &&
      !didAutoInitial.current
    ) {
      didAutoInitial.current = true;
      send(initialPrompt, undefined, resolved.path);
    }
  }, [initialPrompt, forkParams, resolved?.path, send]);

  // Notify parent when session ID becomes known (new sessions)
  const didNotifySessionCreated = useRef(false);
  useEffect(() => {
    if (streamSessionId && isNewSession && !didNotifySessionCreated.current) {
      didNotifySessionCreated.current = true;
      onSessionCreated?.(streamSessionId);
    }
  }, [streamSessionId, isNewSession, onSessionCreated]);

  // Eagerly refresh sidebar when new session ID is known
  const didInvalidate = useRef(false);
  useEffect(() => {
    if (streamSessionId && isNewSession && !didInvalidate.current) {
      didInvalidate.current = true;
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          if (Array.isArray(key) && key.length >= 1 && key[0] === "liveState")
            return true;
          if (Array.isArray(key) && key.length >= 2) {
            if (key[0] === "sessions") return true;
            if (key[0] === "root" && key[1] === "sessions") return true;
          }
          return false;
        },
      });
    }
  }, [streamSessionId, isNewSession, queryClient]);

  // Merge history + stream messages
  const allMessages = useMemo(() => {
    if (isNewSession) return streamMessages;
    if (streamMessages.length === 0) return history ?? [];
    const streamUuids = new Set(streamMessages.map((m) => m.uuid));
    const deduped = (history ?? []).filter((m) => !streamUuids.has(m.uuid));
    return [...deduped, ...streamMessages];
  }, [history, streamMessages, isNewSession]);

  const handleFork = useCallback(
    (messageUuid: string) => {
      if (!effectiveSessionId) return;
      onFork?.(effectiveSessionId, messageUuid);
    },
    [effectiveSessionId, onFork]
  );

  if (!isNewSession && historyLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground animate-pulse">
        Loading session...
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {!isNewSession && effectiveSessionId && (
        <ForkLineageBar
          sessionId={effectiveSessionId}
          projectSlug={projectSlug}
        />
      )}
      <ChatView
        messages={allMessages}
        isStreaming={
          isStreaming &&
          allMessages.length > 0 &&
          allMessages[allMessages.length - 1]?.content.length === 0
        }
        toolProgress={toolProgress}
        projectSlug={projectSlug}
        sessionId={effectiveSessionId}
        onRefresh={!isNewSession ? () => refetch() : undefined}
        onAnswer={answerQuestion}
        onApprovePlan={approvePlan}
        onFork={!isNewSession ? handleFork : undefined}
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
          slug={projectSlug}
          settings={settings}
          onSettingsChange={setSettings}
          disabled={isStreaming}
        />
      </ChatSettingsBar>
      <ChatInput
        onSend={send}
        onStop={stop}
        isStreaming={isStreaming}
        disabled={!resolved?.path}
        storageKey={`${projectSlug}:${effectiveSessionId ?? "new"}`}
        initialChips={initialChips}
      />
    </div>
  );
}

function RootSessionPane({
  sessionId,
  isFocused: _isFocused,
  onSessionCreated,
  onFork,
  forkParams,
}: SessionPaneProps) {
  const queryClient = useQueryClient();
  const isNewSession = sessionId === null;

  const {
    data: history,
    isLoading: historyLoading,
    refetch,
  } = useQuery({
    ...orpc.root.messages.queryOptions({ input: { sessionId: sessionId! } }),
    enabled: !!sessionId,
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
    sessionId: streamSessionId,
    error,
    toolProgress,
    currentPermissionMode,
  } = useRootChatStream({
    ...(sessionId ? { resume: sessionId } : {}),
    permissionMode: settings.planMode ? "plan" : "bypassPermissions",
    model: settings.model,
    enabledOptionalMcps: settings.enabledOptionalMcps,
    ...(forkParams
      ? {
          resume: forkParams.parentSessionId,
          forkSession: true,
          resumeSessionAt: forkParams.resumeSessionAt,
          forkSessionId: forkParams.forkSessionId,
        }
      : {}),
  });

  const effectiveSessionId = streamSessionId ?? sessionId;

  // Register compact callback
  useRegisterCompact(
    effectiveSessionId ?? "",
    effectiveSessionId ? () => send("/compact") : undefined
  );

  // Register send function for context tray
  const sendWhenIdle = useCallback(
    (prompt: string) => {
      if (!isStreaming) send(prompt);
    },
    [isStreaming, send]
  );
  useRegisterSend(
    effectiveSessionId ?? "",
    effectiveSessionId && !isStreaming ? sendWhenIdle : undefined
  );

  // Auto-send from context tray injection
  const didAutoSend = useRef(false);
  useEffect(() => {
    if (
      !effectiveSessionId ||
      didAutoSend.current ||
      historyLoading ||
      isStreaming
    )
      return;
    const key = `context-tray-inject:${effectiveSessionId}`;
    try {
      const injected = sessionStorage.getItem(key);
      if (injected) {
        sessionStorage.removeItem(key);
        didAutoSend.current = true;
        send(injected);
      }
    } catch {}
  }, [effectiveSessionId, historyLoading, isStreaming, send]);

  // Auto-fork
  const didAutoFork = useRef(false);
  useEffect(() => {
    if (forkParams && !didAutoFork.current) {
      didAutoFork.current = true;
      send("");
    }
  }, [forkParams, send]);

  // Notify parent when session ID becomes known
  const didNotifySessionCreated = useRef(false);
  useEffect(() => {
    if (streamSessionId && isNewSession && !didNotifySessionCreated.current) {
      didNotifySessionCreated.current = true;
      onSessionCreated?.(streamSessionId);
    }
  }, [streamSessionId, isNewSession, onSessionCreated]);

  // Eagerly refresh sidebar
  const didInvalidate = useRef(false);
  useEffect(() => {
    if (streamSessionId && isNewSession && !didInvalidate.current) {
      didInvalidate.current = true;
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          if (Array.isArray(key) && key.length >= 1 && key[0] === "liveState")
            return true;
          if (Array.isArray(key) && key.length >= 2) {
            if (key[0] === "sessions") return true;
            if (key[0] === "root" && key[1] === "sessions") return true;
          }
          return false;
        },
      });
    }
  }, [streamSessionId, isNewSession, queryClient]);

  // Merge history + stream messages
  const allMessages = useMemo(() => {
    if (isNewSession) return streamMessages;
    if (streamMessages.length === 0) return history ?? [];
    const streamUuids = new Set(streamMessages.map((m) => m.uuid));
    const deduped = (history ?? []).filter((m) => !streamUuids.has(m.uuid));
    return [...deduped, ...streamMessages];
  }, [history, streamMessages, isNewSession]);

  const handleFork = useCallback(
    (messageUuid: string) => {
      if (!effectiveSessionId) return;
      onFork?.(effectiveSessionId, messageUuid);
    },
    [effectiveSessionId, onFork]
  );

  if (!isNewSession && historyLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground animate-pulse">
        Loading session...
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {!isNewSession && effectiveSessionId && (
        <ForkLineageBar sessionId={effectiveSessionId} projectSlug="__root__" />
      )}
      <ChatView
        messages={allMessages}
        isStreaming={
          isStreaming &&
          allMessages.length > 0 &&
          allMessages[allMessages.length - 1]?.content.length === 0
        }
        toolProgress={toolProgress}
        projectSlug="__root__"
        sessionId={effectiveSessionId}
        onRefresh={!isNewSession ? () => refetch() : undefined}
        onAnswer={answerQuestion}
        onApprovePlan={approvePlan}
        onFork={!isNewSession ? handleFork : undefined}
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
          settings={settings}
          onSettingsChange={setSettings}
          disabled={isStreaming}
        />
      </ChatSettingsBar>
      <ChatInput
        onSend={send}
        onStop={stop}
        isStreaming={isStreaming}
        storageKey={`__root__:${effectiveSessionId ?? "new"}`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public SessionPane — delegates to project or root variant
// ---------------------------------------------------------------------------

export function SessionPane(props: SessionPaneProps) {
  if (props.projectSlug) {
    return <ProjectSessionPane {...props} projectSlug={props.projectSlug} />;
  }
  return <RootSessionPane {...props} />;
}
