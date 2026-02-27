"use client";

import type { ResultBlock as ResultBlockType } from "@/lib/types";

import { Badge } from "@/components/ui/badge";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function ResultBlock({ block }: { block: ResultBlockType }) {
  const stats: { label: string; value: string }[] = [];

  if (block.durationMs)
    stats.push({ label: "Duration", value: formatDuration(block.durationMs) });
  if (block.costUSD)
    stats.push({ label: "Cost", value: formatCost(block.costUSD) });
  if (block.numTurns)
    stats.push({ label: "Turns", value: String(block.numTurns) });
  if (block.inputTokens)
    stats.push({ label: "In", value: formatTokens(block.inputTokens) });
  if (block.outputTokens)
    stats.push({ label: "Out", value: formatTokens(block.outputTokens) });
  if (
    block.contextWindow &&
    block.maxContextWindow &&
    block.maxContextWindow > 0
  )
    stats.push({
      label: "CTX",
      value: `${Math.round((block.contextWindow / block.maxContextWindow) * 100)}%`,
    });

  if (stats.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 py-2">
      {stats.map((s) => (
        <Badge
          key={s.label}
          variant="secondary"
          className="text-[10px] font-normal gap-1"
        >
          <span className="text-muted-foreground">{s.label}</span>
          <span>{s.value}</span>
        </Badge>
      ))}
      {block.isError && (
        <Badge variant="destructive" className="text-[10px]">
          Error
        </Badge>
      )}
    </div>
  );
}
