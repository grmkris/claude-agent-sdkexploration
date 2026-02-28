"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import type { ContextChip } from "@/lib/context-chips";

import { getChipVisuals } from "@/lib/context-chips";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  file: "File",
  commit: "Commit",
  deployment: "Deploy",
  ticket: "Ticket",
  session: "Session",
  "github-pr": "PR",
  email: "Email",
  webhook: "Webhook",
  cron: "Cron",
};

export function TrayChipRow({
  chip,
  onRemove,
}: {
  chip: ContextChip;
  onRemove: () => void;
}) {
  const { icon, colorClass, borderClass } = getChipVisuals(chip.type);

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded border-l-2 bg-muted/30 px-2.5 py-1.5",
        "group/chip transition-colors hover:bg-muted/50",
        borderClass
      )}
    >
      <HugeiconsIcon
        icon={icon}
        size={12}
        strokeWidth={1.5}
        className={cn("shrink-0", colorClass)}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium leading-tight">
          {chip.label}
        </p>
        {chip.subtitle && (
          <p className="truncate text-[10px] leading-tight text-muted-foreground">
            {chip.subtitle}
          </p>
        )}
      </div>
      <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground/60">
        {TYPE_LABELS[chip.type] ?? chip.type}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className={cn(
          "shrink-0 rounded p-0.5 text-muted-foreground/50 transition-colors",
          "hover:text-foreground hover:bg-muted",
          "opacity-0 group-hover/chip:opacity-100"
        )}
        aria-label={`Remove ${chip.label}`}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <line x1="2" y1="2" x2="10" y2="10" />
          <line x1="10" y1="2" x2="2" y2="10" />
        </svg>
      </button>
    </div>
  );
}
