"use client";

import { memo, useState } from "react";

import type { ToolProgressEntry } from "@/hooks/use-chat-stream";
import type { ContentBlock, ThinkingBlock, UserImageBlock } from "@/lib/types";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { CopyButton } from "./copy-button";
import { MarkdownContent } from "./markdown-content";
import { ResultBlock } from "./result-block";
import {
  SystemEventBlock,
  ToolUseSummaryBlock,
  ToolUseSummaryGroup,
} from "./system-event-block";
import { ThinkingBlockView } from "./thinking-block";
import { ToolUseBlock } from "./tool-use-block";

function ForkIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" />
      <path d="M12 12v3" />
    </svg>
  );
}

type ToolUseContentBlock = Extract<ContentBlock, { type: "tool_use" }>;

function ToolGroup({
  blocks,
  toolProgress,
  projectSlug,
  sessionId,
  onAnswer,
  onApprovePlan,
}: {
  blocks: ToolUseContentBlock[];
  toolProgress?: Map<string, ToolProgressEntry>;
  projectSlug?: string;
  sessionId?: string;
  onAnswer?: (toolUseId: string, answers: Record<string, string[]>) => void;
  onApprovePlan?: (
    toolUseId: string,
    approved: boolean,
    feedback?: string
  ) => void;
}) {
  const anyRunning = blocks.some((b) => toolProgress?.has(b.id));
  const doneCount = blocks.filter((b) => b.output !== undefined).length;
  const [open, setOpen] = useState(anyRunning);

  // Unique tool names, max 3 shown
  const names = [...new Set(blocks.map((b) => b.name))];
  const namesSummary =
    names.length <= 3 ? names.join(", ") : names.slice(0, 3).join(", ") + "...";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="my-1.5 flex w-full items-center gap-2 rounded border border-border/50 bg-background/30 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-background/50">
        <span className="text-[10px]">{open ? "▼" : "▶"}</span>
        <span className="font-medium text-foreground">
          {blocks.length} {blocks.length === 1 ? "tool" : "tools"}:{" "}
          {namesSummary}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {anyRunning ? (
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-chart-1" />
              {doneCount}/{blocks.length}
            </span>
          ) : (
            `${doneCount}/${blocks.length} done`
          )}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {blocks.map((block) => {
          const progress = toolProgress?.get(block.id);
          const isRunning = progress !== undefined;
          const elapsed =
            block.elapsed ??
            (progress ? Date.now() - progress.startedAt : undefined);
          return (
            <ToolUseBlock
              key={block.id}
              name={block.name}
              input={block.input}
              output={block.output}
              is_error={block.is_error}
              elapsed={elapsed}
              isRunning={isRunning}
              projectSlug={projectSlug}
              sessionId={sessionId}
              toolUseId={block.id}
              onAnswer={onAnswer}
              onApprovePlan={onApprovePlan}
            />
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

export const MessageBubble = memo(function MessageBubble({
  role,
  content,
  timestamp,
  uuid,
  isStreaming,
  toolProgress,
  projectSlug,
  sessionId,
  onAnswer,
  onApprovePlan,
  onFork,
}: {
  role: "user" | "assistant" | "system";
  content: ContentBlock[];
  timestamp: string;
  uuid?: string;
  isStreaming?: boolean;
  toolProgress?: Map<string, ToolProgressEntry>;
  projectSlug?: string;
  sessionId?: string;
  onAnswer?: (toolUseId: string, answers: Record<string, string[]>) => void;
  onApprovePlan?: (
    toolUseId: string,
    approved: boolean,
    feedback?: string
  ) => void;
  onFork?: (messageUuid: string) => void;
}) {
  if (role === "system") {
    // If all blocks are tool_use_summary, render as a single grouped row
    const allSummaries = content.every((b) => b.type === "tool_use_summary");
    if (allSummaries && content.length > 0) {
      return (
        <ToolUseSummaryGroup
          blocks={
            content as Extract<ContentBlock, { type: "tool_use_summary" }>[]
          }
        />
      );
    }
    return (
      <div className="flex flex-col items-center gap-0.5">
        {content.map((block, i) => {
          if (block.type === "result")
            return <ResultBlock key={i} block={block} />;
          if (block.type === "system_event")
            return <SystemEventBlock key={i} block={block} />;
          if (block.type === "tool_use_summary")
            return <ToolUseSummaryBlock key={i} block={block} />;
          return null;
        })}
      </div>
    );
  }

  if (role === "user") {
    const imageBlocks = content.filter(
      (b): b is UserImageBlock => b.type === "user_image"
    );
    const userTextContent = content
      .filter(
        (b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text"
      )
      .map((b) => b.text)
      .join("\n");
    return (
      <div className="flex w-full justify-end">
        <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-primary text-primary-foreground">
          {/* Attached images */}
          {imageBlocks.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {imageBlocks.map((b, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={b.dataUrl}
                  alt={`Attached image ${i + 1}`}
                  className="max-h-48 max-w-full rounded object-contain"
                />
              ))}
            </div>
          )}
          {/* Text blocks */}
          {content.map((block, i) => {
            if (block.type === "text") {
              return (
                <div key={i} className="whitespace-pre-wrap break-words">
                  {block.text}
                </div>
              );
            }
            return null;
          })}
          <div className="mt-1 flex items-center justify-end gap-1.5">
            {userTextContent && (
              <CopyButton
                text={userTextContent}
                className="opacity-50 hover:opacity-100 [&_svg]:h-2.5 [&_svg]:w-2.5"
              />
            )}
            <span className="text-[10px] opacity-50">
              {new Date(timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── Assistant message ────────────────────────────────────────────────────────

  const textContent = content
    .filter(
      (b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text"
    )
    .map((b) => b.text)
    .join("");

  const hasText = textContent.trim().length > 0;
  const hasTools = content.some((b) => b.type === "tool_use");
  const hasThinking = content.some(
    (b) => b.type === "thinking" || b.type === "redacted_thinking"
  );

  if (!hasText && !hasTools && !hasThinking) return null;

  const isLastAssistantStreaming = isStreaming && hasText;

  // Build render segments.
  // AskUserQuestion and ExitPlanMode blocks are always standalone (never grouped).
  // All other consecutive tool_use blocks are grouped together (even a single one).
  type Segment =
    | { kind: "block"; block: ContentBlock; index: number }
    | { kind: "tool_group"; blocks: ToolUseContentBlock[] };

  const segments: Segment[] = [];
  let currentToolRun: ToolUseContentBlock[] = [];

  const flushToolRun = () => {
    if (currentToolRun.length === 0) return;
    segments.push({ kind: "tool_group", blocks: currentToolRun });
    currentToolRun = [];
  };

  for (let i = 0; i < content.length; i++) {
    const block = content[i];
    if (block.type === "tool_use") {
      const tb = block as ToolUseContentBlock;
      if (tb.name === "AskUserQuestion" || tb.name === "ExitPlanMode") {
        // Always render these standalone — flush any pending group first
        flushToolRun();
        segments.push({ kind: "block", block, index: i });
      } else {
        currentToolRun.push(tb);
      }
    } else if (
      block.type === "thinking" ||
      block.type === "redacted_thinking"
    ) {
      flushToolRun();
      segments.push({ kind: "block", block, index: i });
    } else {
      flushToolRun();
      segments.push({ kind: "block", block, index: i });
    }
  }
  flushToolRun();

  return (
    <div className="flex w-full justify-start">
      <div className="max-w-[90%] pl-1 text-sm">
        {segments.map((seg, si) => {
          if (seg.kind === "tool_group") {
            return (
              <ToolGroup
                key={`tg-${si}`}
                blocks={seg.blocks}
                toolProgress={toolProgress}
                projectSlug={projectSlug}
                sessionId={sessionId}
                onAnswer={onAnswer}
                onApprovePlan={onApprovePlan}
              />
            );
          }

          const { block, index } = seg;

          // Thinking blocks
          if (block.type === "thinking") {
            return (
              <ThinkingBlockView
                key={si}
                thinking={(block as ThinkingBlock).thinking}
              />
            );
          }
          if (block.type === "redacted_thinking") {
            return <ThinkingBlockView key={si} thinking="" isRedacted />;
          }

          // Text blocks — always visible
          if (block.type === "text" && block.text.trim()) {
            const isLast =
              index === content.length - 1 ||
              content.slice(index + 1).every((b) => b.type !== "text");
            return (
              <MarkdownContent
                key={si}
                isStreaming={isLast && isLastAssistantStreaming}
              >
                {block.text}
              </MarkdownContent>
            );
          }

          // Tool use blocks (AskUserQuestion / ExitPlanMode — always standalone)
          if (block.type === "tool_use") {
            const tb = block as ToolUseContentBlock;
            const progress = toolProgress?.get(tb.id);
            const isRunning = progress !== undefined;
            const elapsed =
              tb.elapsed ??
              (progress ? Date.now() - progress.startedAt : undefined);
            return (
              <ToolUseBlock
                key={si}
                name={tb.name}
                input={tb.input}
                output={tb.output}
                is_error={tb.is_error}
                elapsed={elapsed}
                isRunning={isRunning}
                projectSlug={projectSlug}
                sessionId={sessionId}
                toolUseId={tb.id}
                onAnswer={onAnswer}
                onApprovePlan={onApprovePlan}
              />
            );
          }

          return null;
        })}
        <div className="mt-1 flex items-center gap-1.5">
          {hasText && (
            <CopyButton
              text={textContent}
              className="opacity-40 hover:opacity-100"
            />
          )}
          {onFork && uuid && !isStreaming && (
            <button
              onClick={() => onFork(uuid)}
              className="opacity-40 hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
              title="Fork from this message"
            >
              <ForkIcon className="h-3 w-3" />
            </button>
          )}
          <span className="text-[10px] opacity-40">
            {new Date(timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>
    </div>
  );
});
