"use client";

import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import type { ContextChip } from "@/lib/context-chips";

import { chipDedupeKey, resolveChipsToPrompt } from "@/lib/context-chips";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "context-tray-v1";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type TrayState = {
  chips: ContextChip[];
};

type ContextTrayContextProps = {
  /** Current chips in the tray */
  chips: ContextChip[];
  /** Number of chips in the tray */
  chipCount: number;
  /** Whether the tray panel is expanded */
  expanded: boolean;
  /** Set the expanded state */
  setExpanded: (value: boolean) => void;
  /** Toggle the expanded state */
  toggleExpanded: () => void;
  /** Add a chip (deduplicates automatically) */
  addChip: (chip: ContextChip) => void;
  /** Remove a chip by ID */
  removeChip: (id: string) => void;
  /** Clear all chips */
  clearChips: () => void;
  /** Build prompt from chips + user text and navigate to a new chat session */
  startSession: (userPrompt: string) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// localStorage helpers
// ─────────────────────────────────────────────────────────────────────────────

function loadState(): TrayState {
  if (typeof window === "undefined") return { chips: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as TrayState;
  } catch {}
  return { chips: [] };
}

function saveState(state: TrayState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const ContextTrayContext = React.createContext<ContextTrayContextProps | null>(
  null
);

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useContextTray() {
  const context = React.useContext(ContextTrayContext);
  if (!context) {
    throw new Error(
      "useContextTray must be used within a ContextTrayProvider."
    );
  }
  return context;
}

/**
 * Optional hook that returns null instead of throwing when used outside the
 * provider. Useful for components that may or may not be wrapped.
 */
export function useContextTrayMaybe() {
  return React.useContext(ContextTrayContext);
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

/** Extract project slug from paths like /project/[slug]/... */
function extractSlug(pathname: string): string | null {
  const match = pathname.match(/^\/project\/([^/]+)/);
  return match ? match[1] : null;
}

export function ContextTrayProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [trayState, setTrayState] = React.useState<TrayState>(loadState);
  const [expanded, _setExpanded] = React.useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────

  const chips = trayState.chips;
  const chipCount = chips.length;

  // ── Setters ───────────────────────────────────────────────────────────────

  const setExpanded = React.useCallback((value: boolean) => {
    _setExpanded(value);
  }, []);

  const toggleExpanded = React.useCallback(() => {
    _setExpanded((prev) => !prev);
  }, []);

  const addChip = React.useCallback((chip: ContextChip) => {
    setTrayState((prev) => {
      const key = chipDedupeKey(chip);
      const alreadyExists = prev.chips.some((c) => chipDedupeKey(c) === key);
      if (alreadyExists) return prev;

      const next = { chips: [...prev.chips, chip] };
      saveState(next);
      return next;
    });
  }, []);

  const removeChip = React.useCallback((id: string) => {
    setTrayState((prev) => {
      const next = { chips: prev.chips.filter((c) => c.id !== id) };
      saveState(next);
      return next;
    });
  }, []);

  const clearChips = React.useCallback(() => {
    const next = { chips: [] };
    saveState(next);
    setTrayState(next);
    _setExpanded(false);
  }, []);

  // ── Start session ────────────────────────────────────────────────────────

  const startSession = React.useCallback(
    (userPrompt: string) => {
      const contextPrefix = resolveChipsToPrompt(trayState.chips);
      const finalPrompt = contextPrefix
        ? `${contextPrefix}\n\n---\n\n${userPrompt}`
        : userPrompt;

      const slug = extractSlug(pathname);
      const chatUrl = slug
        ? `/project/${slug}/chat?prompt=${encodeURIComponent(finalPrompt)}`
        : `/chat?prompt=${encodeURIComponent(finalPrompt)}`;

      // Clear state before navigating
      const next = { chips: [] };
      setTrayState(next);
      saveState(next);
      _setExpanded(false);

      router.push(chatUrl);
    },
    [trayState.chips, pathname, router]
  );

  // ── Context value ─────────────────────────────────────────────────────────

  const contextValue = React.useMemo<ContextTrayContextProps>(
    () => ({
      chips,
      chipCount,
      expanded,
      setExpanded,
      toggleExpanded,
      addChip,
      removeChip,
      clearChips,
      startSession,
    }),
    [
      chips,
      chipCount,
      expanded,
      setExpanded,
      toggleExpanded,
      addChip,
      removeChip,
      clearChips,
      startSession,
    ]
  );

  return (
    <ContextTrayContext.Provider value={contextValue}>
      {children}
    </ContextTrayContext.Provider>
  );
}
