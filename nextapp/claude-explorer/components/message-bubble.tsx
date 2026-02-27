"use client";

import { useState, useEffect } from "react";

import type { ToolProgressEntry } from "@/hooks/use-chat-stream";
import type { ContentBlock, ThinkingBlock, UserImageBlock } from "@/lib/types";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { MarkdownContent } from "./markdown-content";
import { ResultBlock } from "./result-block";
import { SystemEventBlock, ToolUseSummaryBlock } from "./system-event-block";
import { ThinkingBlockView } from "./thinking-block";
import { ToolUseBlock } from "./tool-use-block";

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
          {blocks.length} tools: {namesSummary}
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

export function MessageBubble({
  role,
  content,
  timestamp,
  isStreaming,
  toolProgress,
  projectSlug,
  sessionId,
  onAnswer,
  onApprovePlan,
}: {
  role: "user" | "assistant" | "system";
  content: ContentBlock[];
  timestamp: string;
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
}) {
  if (role === "system") {
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
          <div className="mt-1 text-[10px] opacity-50 text-right">
            {new Date(timestamp).toLocaleTimeString()}
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

  // Collapsible tool state
  const anyRunning = content.some(
    (b) => b.type === "tool_use" && toolProgress?.has((b as ToolUseContentBlock).id)
  );
  const collapsibleToolCount = content.filter(
    (b) =>
      b.type === "tool_use" &&
      (b as ToolUseContentBlock).name !== "AskUserQuestion" &&
      (b as ToolUseContentBlock).name !== "ExitPlanMode"
  ).length;
  // Start expanded while running, collapsed when done
  const [toolsCollapsed, setToolsCollapsed] = useState(!anyRunning);

  // Auto-collapse when all tools finish
  useEffect(() => {
    if (!anyRunning) setToolsCollapsed(true);
  }, [anyRunning]);

  // Build render segments.
  // AskUserQuestion and ExitPlanMode blocks are always standalone (never grouped).
  // Other consecutive tool_use blocks are grouped when ≥ 3.
  type Segment =
    | { kind: "block"; block: ContentBlock; index: number }
    | { kind: "tool_group"; blocks: ToolUseContentBlock[] };

  const segments: Segment[] = [];
  let currentToolRun: ToolUseContentBlock[] = [];

  const flushToolRun = () => {
    if (currentToolRun.length === 0) return;
    if (currentToolRun.length >= 3) {
      segments.push({ kind: "tool_group", blocks: currentToolRun });
    } else {
      for (const b of currentToolRun) {
        segments.push({ kind: "block", block: b, index: -1 });
      }
    }
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
        {/* Toggle pill — only shown when there are collapsible tool blocks */}
        {collapsibleToolCount > 0 && (
          <button
            onClick={() => setToolsCollapsed((v) => !v)}
            className="mb-1 flex items-center gap-1.5 rounded-full border border-border/40 bg-background/20 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-background/40 hover:text-foreground transition-colors cursor-pointer"
          >
            <span>{toolsCollapsed ? "▶" : "▼"}</span>
            <span>
              {collapsibleToolCount} tool call
              {collapsibleToolCount !== 1 ? "s" : ""}
            </span>
            {anyRunning && (
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-chart-1" />
            )}
          </button>
        )}

        {segments.map((seg, si) => {
          if (seg.kind === "tool_group") {
            if (toolsCollapsed) return null;
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

          // Thinking blocks — hidden when collapsed
          if (block.type === "thinking") {
            if (toolsCollapsed) return null;
            return (
              <ThinkingBlockView
                key={si}
                thinking={(block as ThinkingBlock).thinking}
              />
            );
          }
          if (block.type === "redacted_thinking") {
            if (toolsCollapsed) return null;
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

          // Tool use blocks (AskUserQuestion / ExitPlanMode always visible; others respect collapse)
          if (block.type === "tool_use") {
            const tb = block as ToolUseContentBlock;
            const isInteractive =
              tb.name === "AskUserQuestion" || tb.name === "ExitPlanMode";
            if (!isInteractive && toolsCollapsed) return null;
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
        <div className="mt-1 text-[10px] opacity-40">
          {new Date(timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
