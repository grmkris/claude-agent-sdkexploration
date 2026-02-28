"use client";

import type { StackState, TechCategory } from "./types";

import { CATEGORY_ORDER, TECH_OPTIONS } from "./constants";

interface TechCategoryGridProps {
  stack: StackState;
  onSelect: (category: TechCategory, optionId: string) => void;
  onToggleAddon: (addonId: string) => void;
  getDisabledReason: (
    category: TechCategory,
    optionId: string
  ) => string | null;
}

export function TechCategoryGrid({
  stack,
  onSelect,
  onToggleAddon,
  getDisabledReason,
}: TechCategoryGridProps) {
  function isSelected(category: TechCategory, optionId: string): boolean {
    if (category === "addons") {
      return stack.addons.includes(optionId);
    }
    return (stack[category] as string) === optionId;
  }

  return (
    <div className="flex flex-col gap-3">
      {CATEGORY_ORDER.map((cat) => {
        const options = TECH_OPTIONS[cat.key];
        if (!options || options.length === 0) return null;

        return (
          <div key={cat.key}>
            <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {cat.label}
            </h4>
            <div className="flex flex-wrap gap-1">
              {options.map((opt) => {
                const selected = isSelected(cat.key, opt.id);
                const disabledReason = getDisabledReason(cat.key, opt.id);
                const disabled = !!disabledReason;

                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={disabled}
                    title={disabledReason ?? opt.description}
                    onClick={() => {
                      if (cat.multiSelect) {
                        onToggleAddon(opt.id);
                      } else {
                        onSelect(cat.key, opt.id);
                      }
                    }}
                    className={`flex items-center gap-1.5 rounded border px-2 py-1 text-left text-[11px] transition-colors ${
                      selected
                        ? "border-primary bg-primary/10 text-foreground"
                        : disabled
                          ? "cursor-not-allowed border-border/50 text-muted-foreground/50"
                          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    <span className="text-xs leading-none">{opt.icon}</span>
                    <span className="font-medium leading-tight">
                      {opt.name}
                    </span>
                    {selected && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-2.5 w-2.5 text-primary"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {opt.isDefault && !selected && (
                      <span className="text-[9px] text-muted-foreground/60">
                        default
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
