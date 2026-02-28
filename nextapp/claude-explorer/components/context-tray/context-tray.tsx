"use client";

import {
  Attachment01Icon,
  Cancel01Icon,
  Delete02Icon,
  SendHorizontal,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAgentTabs } from "@/components/agent-tabs/tab-context";
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
    sendToExistingSession,
    mountedSessionIds,
  } = useContextTray();

  const { tabs } = useAgentTabs();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");
  const [showSessionMenu, setShowSessionMenu] = useState(false);

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
        if (showSessionMenu) {
          setShowSessionMenu(false);
        } else {
          setExpanded(false);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [expanded, setExpanded, showSessionMenu]);

  const handleStartSession = useCallback(() => {
    if (chipCount === 0) return;
    startSession(prompt.trim());
    setPrompt("");
  }, [chipCount, prompt, startSession]);

  const handleSendToSession = useCallback(
    (sessionId: string) => {
      if (chipCount === 0) return;
      const sent = sendToExistingSession(sessionId, prompt.trim());
      if (sent) {
        setPrompt("");
        setShowSessionMenu(false);
      }
    },
    [chipCount, prompt, sendToExistingSession]
  );

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

  // ── Session tabs that have a sessionId (for the dropdown) ─────────────────

  const sessionTabs = tabs.filter((t) => t.type === "session" && t.sessionId);

  const mountedSet = new Set(mountedSessionIds);
  const hasMountedSessions = sessionTabs.some(
    (t) => t.sessionId && mountedSet.has(t.sessionId)
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
          <div className="relative flex items-center gap-1">
            {/* Send to existing session button (only if sessions exist) */}
            {hasMountedSessions && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 px-2"
                disabled={chipCount === 0}
                onClick={() => setShowSessionMenu((v) => !v)}
                title="Send to open session"
              >
                <HugeiconsIcon icon={SendHorizontal} size={12} />▾
              </Button>
            )}
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={chipCount === 0}
              onClick={handleStartSession}
            >
              ✦ Start Session
            </Button>

            {/* Session dropdown menu */}
            {showSessionMenu && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-[60]"
                  onClick={() => setShowSessionMenu(false)}
                />
                <div className="absolute bottom-full right-0 mb-1 z-[61] w-64 rounded-md border bg-popover p-1 shadow-lg">
                  <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Send to open session
                  </div>
                  {sessionTabs.map((tab) => {
                    if (!tab.sessionId) return null;
                    const isMounted = mountedSet.has(tab.sessionId);
                    if (!isMounted) return null;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => handleSendToSession(tab.sessionId!)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors",
                          "hover:bg-accent"
                        )}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-green-400 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">
                          {tab.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
