"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { orpc } from "@/lib/orpc";

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatCost(usd: number): string {
  if (usd < 0.001) return `$${usd.toFixed(5)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatElapsed(startedAt: string): string {
  const elapsed = Math.floor(
    (Date.now() - new Date(startedAt).getTime()) / 1000
  );
  if (elapsed < 60) return `${elapsed}s`;
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

/** Derive bar color from fill percentage */
function barColor(pct: number): string {
  if (pct >= 0.9) return "bg-red-500";
  if (pct >= 0.7) return "bg-yellow-500";
  return "bg-green-500";
}

const ACTIVE_STATES = new Set([
  "initializing",
  "thinking",
  "tool_running",
  "subagent_running",
  "compacting",
  "waiting_for_permission",
]);

export function ContextBar({
  sessionId,
  onCompact,
  isStreaming,
}: {
  sessionId: string;
  onCompact?: () => void;
  isStreaming?: boolean;
}) {
  const { data } = useQuery(
    orpc.liveState.session.queryOptions({ input: { sessionId } })
  );

  // Tick elapsed time every second while session is active
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!data || !ACTIVE_STATES.has(data.state)) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [data?.state]);

  if (!data) return null;

  const contextWindow = data.context_window ?? null;
  const maxContextWindow = data.max_context_window ?? null;
  const hasContext =
    contextWindow !== null && maxContextWindow !== null && maxContextWindow > 0;
  const pct = hasContext ? contextWindow! / maxContextWindow! : null;

  const inputTokens = data.input_tokens;
  const outputTokens = data.output_tokens;
  const costUsd = data.cost_usd;
  const model = data.model;
  const isActive = ACTIVE_STATES.has(data.state);

  // Only show the bar if we have at least some data worth showing
  const hasAnyData = hasContext || inputTokens || costUsd || model;
  if (!hasAnyData) return null;

  // Compact button is available when session is idle (not actively streaming)
  // and a send callback is provided
  const canCompact = onCompact && !isStreaming && !isActive;

  return (
    <div className="flex items-center gap-3 border-b border-border/50 bg-background/80 px-4 py-1.5 text-[11px] text-muted-foreground backdrop-blur-sm">
      {/* Model pill */}
      {model && (
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/70">
          {model}
        </span>
      )}

      {/* Context window progress bar */}
      {hasContext && pct !== null && (
        <div className="flex items-center gap-1.5">
          <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${barColor(pct)}`}
              style={{ width: `${Math.min(pct * 100, 100).toFixed(1)}%` }}
            />
          </div>
          <span
            className={
              pct >= 0.9
                ? "text-red-500 font-medium"
                : pct >= 0.7
                  ? "text-yellow-500"
                  : ""
            }
          >
            {(pct * 100).toFixed(0)}%
          </span>
          <span className="text-muted-foreground/60">
            {formatTokens(contextWindow!)} / {formatTokens(maxContextWindow!)}
          </span>
        </div>
      )}

      {/* Divider */}
      {hasContext && (inputTokens || costUsd) && (
        <span className="text-border">·</span>
      )}

      {/* Token counts */}
      {inputTokens != null && (
        <span>
          <span className="text-muted-foreground/60">in </span>
          {formatTokens(inputTokens)}
        </span>
      )}
      {outputTokens != null && (
        <span>
          <span className="text-muted-foreground/60">out </span>
          {formatTokens(outputTokens)}
        </span>
      )}

      {/* Cost */}
      {costUsd != null && costUsd > 0 && (
        <>
          <span className="text-border">·</span>
          <span>{formatCost(costUsd)}</span>
        </>
      )}

      {/* Elapsed time — only while session is active */}
      {isActive && data.started_at && (
        <>
          <span className="text-border">·</span>
          <span className="tabular-nums">{formatElapsed(data.started_at)}</span>
        </>
      )}

      {/* Manual compact button — pushed to the right */}
      {onCompact && (
        <div className="ml-auto">
          <button
            onClick={onCompact}
            disabled={!canCompact}
            title={
              canCompact
                ? "Compact context (summarise history to free up context window)"
                : "Cannot compact while session is active"
            }
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-muted enabled:hover:text-foreground"
          >
            <span>⟳</span>
            <span>Compact</span>
          </button>
        </div>
      )}
    </div>
  );
}
