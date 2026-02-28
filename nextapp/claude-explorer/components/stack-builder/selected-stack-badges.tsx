"use client";

import { Badge } from "@/components/ui/badge";

import type { StackState, TechCategory } from "./types";

import { CATEGORY_ORDER, TECH_OPTIONS } from "./constants";

interface SelectedStackBadgesProps {
  stack: StackState;
  onRemove: (category: TechCategory, optionId: string) => void;
}

export function SelectedStackBadges({
  stack,
  onRemove,
}: SelectedStackBadgesProps) {
  const badges: Array<{
    category: TechCategory;
    label: string;
    optionId: string;
    optionName: string;
    icon: string;
  }> = [];

  for (const cat of CATEGORY_ORDER) {
    const options = TECH_OPTIONS[cat.key];
    if (!options) continue;

    if (cat.key === "addons") {
      for (const addonId of stack.addons) {
        const opt = options.find((o) => o.id === addonId);
        if (opt) {
          badges.push({
            category: cat.key,
            label: cat.label,
            optionId: addonId,
            optionName: opt.name,
            icon: opt.icon,
          });
        }
      }
    } else {
      const value = stack[cat.key] as string;
      if (value === "none") continue;

      const opt = options.find((o) => o.id === value);
      if (opt) {
        badges.push({
          category: cat.key,
          label: cat.label,
          optionId: value,
          optionName: opt.name,
          icon: opt.icon,
        });
      }
    }
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <Badge
          key={`${b.category}-${b.optionId}`}
          variant="secondary"
          className="gap-1 pr-1 text-[10px]"
        >
          <span>{b.icon}</span>
          <span>{b.optionName}</span>
          <button
            type="button"
            onClick={() => onRemove(b.category, b.optionId)}
            className="ml-0.5 rounded-sm p-0.5 hover:bg-foreground/10"
            title={`Remove ${b.optionName}`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-2.5 w-2.5"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </Badge>
      ))}
    </div>
  );
}
