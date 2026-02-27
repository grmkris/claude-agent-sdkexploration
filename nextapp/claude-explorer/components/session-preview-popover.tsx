"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc";
import { getTimeAgo } from "@/lib/utils";

interface SessionPreviewPopoverProps {
  children: React.ReactNode;
  sessionId: string;
  slug: string;
  firstPrompt: string;
  lastModified?: string;
  timestamp?: string;
  model?: string;
  numTurns?: number | null;
}

export function SessionPreviewPopover({
  children,
  sessionId,
  slug,
  firstPrompt,
  lastModified,
  timestamp,
  model,
  numTurns,
}: SessionPreviewPopoverProps) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = useQuery({
    ...orpc.sessions.preview.queryOptions({
      input: { sessionId, slug },
    }),
    enabled: open,
    staleTime: 5 * 60 * 1000, // 5 min — no need to re-fetch on every hover
  });

  const handleMouseEnter = () => {
    timerRef.current = setTimeout(() => setOpen(true), 400);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(false);
  };

  const timeAgo = getTimeAgo(lastModified ?? timestamp ?? "");
  const shortModel = model?.replace(/^claude-/, "") ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        asChild
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="contents">{children}</div>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        sideOffset={8}
        align="start"
        className="w-80 p-0 overflow-hidden"
        onMouseEnter={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
          setOpen(true);
        }}
        onMouseLeave={handleMouseLeave}
      >
        {/* First message */}
        <div className="px-3 pt-3 pb-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Started with
          </p>
          <p className="text-xs leading-relaxed line-clamp-4 text-foreground">
            {firstPrompt}
          </p>
        </div>

        <div className="mx-3 border-t border-border" />

        {/* Last assistant message */}
        <div className="px-3 pt-2 pb-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Last reply
          </p>
          {isLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          ) : data?.lastAssistantMessage ? (
            <p className="text-xs leading-relaxed line-clamp-5 text-foreground">
              {data.lastAssistantMessage}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No reply yet
            </p>
          )}
        </div>

        {/* Footer metadata */}
        {(timeAgo || shortModel || numTurns != null) && (
          <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
            {numTurns != null && <span>{numTurns} turns</span>}
            {shortModel && <span>{shortModel}</span>}
            {timeAgo && <span className="ml-auto">{timeAgo}</span>}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
