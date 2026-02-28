"use client";

import {
  Attachment01Icon,
  Cancel01Icon,
  Delete02Icon,
  SendHorizontal,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RecentSession } from "@/lib/types";

import { TrayChipRow } from "@/components/context-tray/tray-chip-row";
import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/orpc";
import { cn, getTimeAgo } from "@/lib/utils";

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
    sendToNonMountedSession,
    mountedSessionIds,
  } = useContextTray();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [showSessionMenu, setShowSessionMenu] = useState(false);
  const [sessionFilter, setSessionFilter] = useState("");

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

  // Focus search input when session menu opens
  useEffect(() => {
    if (showSessionMenu) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else {
      setSessionFilter("");
    }
  }, [showSessionMenu]);

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

  // ── Fetch all non-archived sessions (lazy – only when dropdown is open) ──

  const { data: allSessions = [], isLoading: sessionsLoading } = useQuery({
    ...orpc.sessions.timeline.queryOptions({ input: { limit: 30 } }),
    refetchInterval: 15_000,
    enabled: showSessionMenu,
  });

  // ── Grouped + filtered sessions ──────────────────────────────────────────

  const mountedSet = useMemo(
    () => new Set(mountedSessionIds),
    [mountedSessionIds]
  );

  const { openSessions, recentSessions } = useMemo(() => {
    const q = sessionFilter.toLowerCase();
    const filtered = q
      ? allSessions.filter(
          (s) =>
            s.firstPrompt.toLowerCase().includes(q) ||
            (s.projectSlug && s.projectSlug.toLowerCase().includes(q))
        )
      : allSessions;

    const open: RecentSession[] = [];
    const recent: RecentSession[] = [];

    for (const s of filtered) {
      if (mountedSet.has(s.id)) {
        open.push(s);
      } else {
        recent.push(s);
      }
    }

    return { openSessions: open, recentSessions: recent };
  }, [allSessions, sessionFilter, mountedSet]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStartSession = useCallback(() => {
    if (chipCount === 0) return;
    startSession(prompt.trim());
    setPrompt("");
  }, [chipCount, prompt, startSession]);

  const handleSendToSession = useCallback(
    (session: RecentSession) => {
      if (chipCount === 0) return;
      const isMounted = mountedSet.has(session.id);
      if (isMounted) {
        const sent = sendToExistingSession(session.id, prompt.trim());
        if (sent) {
          setPrompt("");
          setShowSessionMenu(false);
        }
      } else {
        sendToNonMountedSession(
          { id: session.id, projectSlug: session.projectSlug },
          prompt.trim()
        );
        setPrompt("");
        setShowSessionMenu(false);
      }
    },
    [
      chipCount,
      prompt,
      mountedSet,
      sendToExistingSession,
      sendToNonMountedSession,
    ]
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

  // ── Collapsed pill ──────────────────────────────────────────────────────

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={toggleExpanded}
        className={cn(
          "fixed bottom-6 right-6 z-50",
          "flex items-center gap-2 rounded-full border bg-background shadow-lg",
          "transition-all duration-200 hover:shadow-xl hover:bg-accent",
          chipCount > 0
            ? "px-3.5 py-2"
            : "px-2.5 py-1.5 opacity-60 hover:opacity-100",
          flash && "ring-2 ring-primary/50 ring-offset-2 ring-offset-background"
        )}
      >
        <HugeiconsIcon
          icon={Attachment01Icon}
          size={chipCount > 0 ? 14 : 12}
          strokeWidth={1.5}
          className="text-muted-foreground"
        />
        {chipCount > 0 ? (
          <>
            <span className="text-xs font-medium">
              {chipCount} {chipCount === 1 ? "item" : "items"}
            </span>
            <span className="text-[10px] text-muted-foreground">Chat ▸</span>
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground">Tray</span>
        )}
      </button>
    );
  }

  // ── Expanded panel ────────────────────────────────────────────────────

  const totalDropdownSessions = openSessions.length + recentSessions.length;

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
            {/* Send to existing session dropdown */}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 px-2"
              disabled={chipCount === 0}
              onClick={() => setShowSessionMenu((v) => !v)}
              title="Send to existing session"
            >
              <HugeiconsIcon icon={SendHorizontal} size={12} />
              <span className="text-[10px]">▾</span>
            </Button>
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
                <div className="absolute bottom-full right-0 mb-1 z-[61] w-72 rounded-md border bg-popover shadow-lg flex flex-col max-h-[300px]">
                  {/* Search input */}
                  <div className="p-2 border-b">
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search sessions..."
                      value={sessionFilter}
                      onChange={(e) => setSessionFilter(e.target.value)}
                      className="w-full rounded border bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  {/* Session list */}
                  <div className="flex-1 overflow-y-auto p-1">
                    {sessionsLoading ? (
                      <div className="px-2 py-3 text-center text-[10px] text-muted-foreground animate-pulse">
                        Loading sessions...
                      </div>
                    ) : totalDropdownSessions === 0 ? (
                      <div className="px-2 py-3 text-center text-[10px] text-muted-foreground">
                        {sessionFilter
                          ? "No matching sessions"
                          : "No sessions found"}
                      </div>
                    ) : (
                      <>
                        {/* Open (mounted) sessions */}
                        {openSessions.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                              Open Sessions
                            </div>
                            {openSessions.map((session) => (
                              <SessionRow
                                key={session.id}
                                session={session}
                                isMounted
                                onClick={() => handleSendToSession(session)}
                              />
                            ))}
                          </>
                        )}

                        {/* Recent (non-mounted) sessions */}
                        {recentSessions.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                              Recent Sessions
                            </div>
                            {recentSessions.map((session) => (
                              <SessionRow
                                key={session.id}
                                session={session}
                                isMounted={false}
                                onClick={() => handleSendToSession(session)}
                              />
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Session row
// ─────────────────────────────────────────────────────────────────────────────

function SessionRow({
  session,
  isMounted,
  onClick,
}: {
  session: RecentSession;
  isMounted: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors",
        "hover:bg-accent"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full shrink-0",
          isMounted ? "bg-green-400" : "bg-muted-foreground/40"
        )}
      />
      <div className="min-w-0 flex-1">
        <span className="block truncate">
          {session.firstPrompt || "Untitled session"}
        </span>
        <span className="block text-[10px] text-muted-foreground truncate">
          {session.projectSlug && session.projectSlug !== "__root__"
            ? `${session.projectSlug} · `
            : ""}
          {getTimeAgo(session.lastModified)}
        </span>
      </div>
    </button>
  );
}
