"use client";

import { useEffect } from "react";

import { CopyButton } from "@/components/copy-button";

import type { StackState, TechCategory } from "./types";

import { PRESET_STACKS } from "./constants";
import { SelectedStackBadges } from "./selected-stack-badges";
import { TechCategoryGrid } from "./tech-category-grid";
import { useStackBuilder } from "./use-stack-builder";

interface StackBuilderPanelProps {
  projectName: string;
  onStackChange: (
    stack: StackState,
    cliCommand: { command: "bun" | "npx" | "pnpm"; args: string[] }
  ) => void;
}

export function StackBuilderPanel({
  projectName,
  onStackChange,
}: StackBuilderPanelProps) {
  const builder = useStackBuilder();

  // Sync project name from parent
  useEffect(() => {
    if (projectName && projectName !== builder.stack.projectName) {
      builder.setProjectName(projectName);
    }
  }, [projectName]);

  // Notify parent when stack or CLI command changes
  useEffect(() => {
    onStackChange(builder.stack, builder.cliCommand);
  }, [builder.cliString]);

  function handleRemoveBadge(category: TechCategory, optionId: string) {
    if (category === "addons") {
      builder.toggleAddon(optionId);
    } else {
      builder.selectOption(category, "none");
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Preset buttons */}
      <div className="flex gap-1">
        {PRESET_STACKS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => builder.applyPreset(preset.id)}
            className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            title={preset.description}
          >
            <span className="mr-1">{preset.icon}</span>
            {preset.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => builder.reset()}
          className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-foreground"
          title="Reset to defaults"
        >
          Reset
        </button>
      </div>

      {/* Selected stack badges */}
      <SelectedStackBadges stack={builder.stack} onRemove={handleRemoveBadge} />

      {/* CLI command display */}
      <div className="flex items-center gap-2 rounded border border-dashed bg-muted/30 px-2.5 py-1.5">
        <code className="flex-1 overflow-x-auto whitespace-nowrap text-[10px] font-mono text-muted-foreground">
          {builder.cliString}
        </code>
        <CopyButton text={builder.cliString} />
      </div>

      {/* Compatibility notes */}
      {builder.compatibilityNotes.length > 0 && (
        <div className="flex flex-col gap-0.5 rounded border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5">
          {builder.compatibilityNotes.map((note) => (
            <p key={note} className="text-[10px] text-amber-500">
              ⚠ {note}
            </p>
          ))}
        </div>
      )}

      {/* Category selection grid */}
      <div className="max-h-[400px] overflow-y-auto pr-1">
        <TechCategoryGrid
          stack={builder.stack}
          onSelect={builder.selectOption}
          onToggleAddon={builder.toggleAddon}
          getDisabledReason={builder.getDisabledReason}
        />
      </div>
    </div>
  );
}
