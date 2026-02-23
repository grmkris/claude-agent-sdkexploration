"use client";

import { useEffect, useRef } from "react";

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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Determine streaming indicator text
  const runningTools = toolProgress ? Array.from(toolProgress.values()) : [];
  const streamingLabel =
    runningTools.length > 0
      ? `Running ${runningTools[runningTools.length - 1].toolName}...`
      : "Thinking...";

  return (
    <ScrollArea className="flex-1 overflow-hidden">
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
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
