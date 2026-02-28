"use client";

import {
  Attachment01Icon,
  Cancel01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { TrayChipRow } from "@/components/context-tray/tray-chip-row";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useContextTray } from "./context-tray-context";

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ContextTray() {
  const {
    chips,
    chipCount,
    expanded,
    setExpanded,
    toggleExpanded,
    removeChip,
    clearChips,
    startSession,
  } = useContextTray();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");

  // Track previous chip count for flash animation
  const prevCountRef = useRef(chipCount);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (chipCount > prevCountRef.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 600);
      return () => clearTimeout(t);
    }
    prevCountRef.current = chipCount;
  }, [chipCount]);

  // Focus textarea when expanding
  useEffect(() => {
    if (expanded) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [expanded]);

  // Close on Escape
  useEffect(() => {
    if (!expanded) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [expanded, setExpanded]);

  const handleStartSession = useCallback(() => {
    if (chipCount === 0) return;
    startSession(prompt.trim());
    setPrompt("");
  }, [chipCount, prompt, startSession]);

  // Handle Cmd/Ctrl+Enter to send
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleStartSession();
      }
    },
    [handleStartSession]
  );

  // Don't render anything when empty
  if (chipCount === 0 && !expanded) return null;

  // ── Collapsed pill ──────────────────────────────────────────────────────

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={toggleExpanded}
        className={cn(
          "fixed bottom-6 right-6 z-50",
          "flex items-center gap-2 rounded-full border bg-background px-3.5 py-2 shadow-lg",
          "transition-all duration-200 hover:shadow-xl hover:bg-accent",
          flash && "ring-2 ring-primary/50 ring-offset-2 ring-offset-background"
        )}
      >
        <HugeiconsIcon
          icon={Attachment01Icon}
          size={14}
          strokeWidth={1.5}
          className="text-muted-foreground"
        />
        <span className="text-xs font-medium">
          {chipCount} {chipCount === 1 ? "item" : "items"}
        </span>
        <span className="text-[10px] text-muted-foreground">Chat ▸</span>
      </button>
    );
  }

  // ── Expanded panel ────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 w-80",
        "flex flex-col rounded-lg border bg-background shadow-xl",
        "max-h-[70vh] animate-in slide-in-from-bottom-2 duration-200"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={Attachment01Icon}
            size={13}
            strokeWidth={1.5}
            className="text-muted-foreground"
          />
          <span className="text-xs font-medium">Context Tray</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {chipCount}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {chipCount > 0 && (
            <button
              type="button"
              onClick={clearChips}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Clear all"
            >
              <HugeiconsIcon icon={Delete02Icon} size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Minimize"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={12} />
          </button>
        </div>
      </div>

      {/* Chip list */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2 flex flex-col gap-1.5">
        {chipCount === 0 ? (
          <p className="py-4 text-center text-[10px] text-muted-foreground">
            No items yet. Browse files, commits, tickets and click{" "}
            <span className="font-medium">📎 Add</span> to collect context.
          </p>
        ) : (
          chips.map((chip) => (
            <TrayChipRow
              key={chip.id}
              chip={chip}
              onRemove={() => removeChip(chip.id)}
            />
          ))
        )}
      </div>

      {/* Textarea + actions */}
      <div className="border-t px-3 py-2.5">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What should Claude focus on?"
          rows={3}
          className={cn(
            "w-full resize-none rounded border bg-transparent px-2.5 py-2 text-xs",
            "outline-none placeholder:text-muted-foreground",
            "focus:ring-1 focus:ring-ring"
          )}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {chipCount} {chipCount === 1 ? "item" : "items"} attached
            {prompt.trim() ? " · ⌘↵ to send" : ""}
          </span>
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            disabled={chipCount === 0}
            onClick={handleStartSession}
          >
            ✦ Start Session
          </Button>
        </div>
      </div>
    </div>
  );
}
