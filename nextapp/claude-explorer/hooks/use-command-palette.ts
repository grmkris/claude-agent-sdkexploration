"use client";

import { useEffect } from "react";

/**
 * Registers a global Cmd+K / Ctrl+K keyboard shortcut.
 * Follows the same pattern used by sidebar (Cmd+B), right sidebar (Cmd+E),
 * and agent tab bar (Cmd+J).
 */
export function useCommandPaletteShortcut(onToggle: () => void) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onToggle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onToggle]);
}
