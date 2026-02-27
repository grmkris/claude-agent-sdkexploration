"use client";

import { useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { MarkdownContent } from "./markdown-content";

export function ThinkingBlockView({
  thinking,
  isRedacted,
}: {
  thinking: string;
  isRedacted?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const preview =
    !isRedacted && thinking.length > 80
      ? thinking.slice(0, 80).replace(/\n/g, " ").trim() + "…"
      : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-1.5">
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded border border-amber-500/20 bg-amber-50/5 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-amber-50/10 transition-colors">
        {/* Brain icon */}
        <span className="text-amber-500 shrink-0">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.44-4.66z" />
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.44-4.66z" />
          </svg>
        </span>

        <span className="font-medium text-amber-600 dark:text-amber-400">
          {isRedacted ? "Redacted thinking" : "Thinking"}
        </span>

        {preview && !open && (
          <span className="ml-1 truncate text-[10px] text-muted-foreground opacity-70">
            {preview}
          </span>
        )}

        <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
          {open ? "▼" : "▶"}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-1 rounded border border-amber-500/10 bg-amber-50/5 px-3 py-2 text-xs">
          {isRedacted ? (
            <p className="italic text-muted-foreground">
              This thinking block has been redacted.
            </p>
          ) : (
            <MarkdownContent>{thinking}</MarkdownContent>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
