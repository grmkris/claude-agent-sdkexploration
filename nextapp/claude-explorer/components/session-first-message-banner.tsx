"use client";

import { ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc";

interface SessionFirstMessageBannerProps {
  sessionId: string;
  slug: string;
}

function getStorageKey(sessionId: string) {
  return `session-banner-expanded:${sessionId}`;
}

export function SessionFirstMessageBanner({
  sessionId,
  slug,
}: SessionFirstMessageBannerProps) {
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(getStorageKey(sessionId)) === "true";
  });

  const { data, isLoading } = useQuery({
    ...orpc.sessions.preview.queryOptions({
      input: { sessionId, slug },
    }),
    staleTime: 5 * 60 * 1000,
  });

  const firstPrompt = data?.firstPrompt;

  useEffect(() => {
    localStorage.setItem(getStorageKey(sessionId), String(expanded));
  }, [expanded, sessionId]);

  // Don't render anything if we've loaded and there's no first prompt
  if (!isLoading && !firstPrompt) return null;

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="group w-full text-left border-b border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-2 px-3 py-1.5">
        {/* Label */}
        <span className="mt-px shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Started&nbsp;with
        </span>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <div className="flex items-center gap-2 py-0.5">
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
          ) : (
            <p
              className={[
                "text-xs leading-relaxed text-foreground transition-all duration-200",
                expanded ? "" : "line-clamp-1",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {firstPrompt}
            </p>
          )}
        </div>

        {/* Expand/collapse chevron */}
        {!isLoading && firstPrompt && (
          <HugeiconsIcon
            icon={expanded ? ArrowUp01Icon : ArrowDown01Icon}
            size={12}
            className="mt-0.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
          />
        )}
      </div>
    </button>
  );
}
