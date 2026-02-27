"use client";

import {
  ArrowDown01Icon,
  ArrowReloadHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useCallback, useState } from "react";

import type { ToolProgressEntry } from "@/hooks/use-chat-stream";
import type { ParsedMessage } from "@/lib/types";

import { ContextBar } from "./context-bar";
import { MessageBubble } from "./message-bubble";
import { SessionStateBadge } from "./session-state-badge";

export function ChatView({
  messages,
  isStreaming,
  toolProgress,
  projectSlug,
  sessionId,
  onRefresh,
  onAnswer,
  onApprovePlan,
  onCompact,
}: {
  messages: ParsedMessage[];
  isStreaming?: boolean;
  toolProgress?: Map<string, ToolProgressEntry>;
  projectSlug?: string;
  sessionId?: string | null;
  onRefresh?: () => void;
  onAnswer?: (toolUseId: string, answers: Record<string, string[]>) => void;
  onApprovePlan?: (
    toolUseId: string,
    approved: boolean,
    feedback?: string
  ) => void;
  onCompact?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    stickToBottom.current = true;
    setShowScrollButton(false);
  }, []);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    stickToBottom.current = atBottom;
    setShowScrollButton(!atBottom);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Scroll to bottom on new messages only if stuck to bottom
  useEffect(() => {
    if (stickToBottom.current) {
      const el = containerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Scroll to bottom on initial mount
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const runningTools = toolProgress ? Array.from(toolProgress.values()) : [];
  const streamingLabel =
    runningTools.length > 0
      ? `Running ${runningTools[runningTools.length - 1].toolName}...`
      : "Thinking...";

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden">
      {sessionId && (
        <ContextBar
          sessionId={sessionId}
          onCompact={onCompact}
          isStreaming={isStreaming}
        />
      )}
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-4">
          {messages.length === 0 && (
            <div className="flex flex-1 items-center justify-center py-20 text-sm text-muted-foreground">
              No messages yet
            </div>
          )}
          {messages.map((msg, i) => {
            const isLastAssistant =
              msg.role === "assistant" && i === messages.length - 1;
            return (
              <MessageBubble
                key={msg.uuid}
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
                isStreaming={isLastAssistant && isStreaming}
                toolProgress={toolProgress}
                projectSlug={projectSlug}
                sessionId={sessionId ?? undefined}
                onAnswer={onAnswer}
                onApprovePlan={onApprovePlan}
              />
            );
          })}
          {isStreaming && (
            <div className="flex justify-start">
              <div className="rounded-lg px-3 py-2 text-xs text-muted-foreground">
                {sessionId ? (
                  <SessionStateBadge sessionId={sessionId} />
                ) : (
                  <span className="animate-pulse">{streamingLabel}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating scroll-to-bottom + refresh buttons */}
      {showScrollButton && (
        <div className="absolute bottom-4 right-4 flex gap-1.5">
          {onRefresh && (
            <button
              onClick={() => {
                onRefresh();
                scrollToBottom();
              }}
              className="flex items-center justify-center rounded-full bg-background border border-border shadow-md w-8 h-8 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              title="Refresh messages"
            >
              <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={14} />
            </button>
          )}
          <button
            onClick={scrollToBottom}
            className="flex items-center justify-center rounded-full bg-background border border-border shadow-md w-8 h-8 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            title="Scroll to bottom"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
