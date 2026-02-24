"use client";

import { useEffect, useRef, useCallback } from "react";

import type { ToolProgressEntry } from "@/hooks/use-chat-stream";
import type { ParsedMessage } from "@/lib/types";

import { ScrollArea } from "@/components/ui/scroll-area";

import { MessageBubble } from "./message-bubble";

export function ChatView({
  messages,
  isStreaming,
  toolProgress,
  projectSlug,
}: {
  messages: ParsedMessage[];
  isStreaming?: boolean;
  toolProgress?: Map<string, ToolProgressEntry>;
  projectSlug?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const handleScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const threshold = 100;
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    if (stickToBottom.current) {
      const el = viewportRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Determine streaming indicator text
  const runningTools = toolProgress ? Array.from(toolProgress.values()) : [];
  const streamingLabel =
    runningTools.length > 0
      ? `Running ${runningTools[runningTools.length - 1].toolName}...`
      : "Thinking...";

  return (
    <ScrollArea className="flex-1 overflow-hidden" viewportRef={viewportRef}>
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
            />
          );
        })}
        {isStreaming && (
          <div className="flex justify-start">
            <div className="rounded-lg px-3 py-2 text-xs text-muted-foreground animate-pulse">
              {streamingLabel}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
