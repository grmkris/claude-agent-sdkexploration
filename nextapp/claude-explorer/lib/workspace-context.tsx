"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkspacePanel = {
  id: string;
  sessionId: string | null; // null = new session (not yet started)
  projectSlug?: string; // undefined = root session
};

type WorkspaceState = {
  panels: WorkspacePanel[];
  focusedPanelId: string | null;
};

type WorkspaceContextProps = {
  panels: WorkspacePanel[];
  focusedPanelId: string | null;
  hasPanels: boolean;
  openSession: (sessionId: string, projectSlug?: string) => void;
  openNewSession: (projectSlug?: string) => string; // returns panelId
  closePanel: (panelId: string) => void;
  focusPanel: (panelId: string) => void;
  updatePanelSession: (panelId: string, sessionId: string) => void;
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "workspace-panels-v1";

function loadState(): WorkspaceState {
  if (typeof window === "undefined")
    return { panels: [], focusedPanelId: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as WorkspaceState;
  } catch {}
  return { panels: [], focusedPanelId: null };
}

function saveState(state: WorkspaceState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const WorkspaceContext = React.createContext<WorkspaceContextProps | null>(
  null
);

export function useWorkspace() {
  const context = React.useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider.");
  }
  return context;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = React.useState<WorkspaceState>(loadState);

  const hasPanels = state.panels.length > 0;

  // ── Panel operations ────────────────────────────────────────────────────

  const openSession = React.useCallback(
    (sessionId: string, projectSlug?: string) => {
      setState((prev) => {
        // Check if panel already exists for this session
        const existing = prev.panels.find((p) => p.sessionId === sessionId);
        if (existing) {
          if (prev.focusedPanelId === existing.id) return prev;
          const next = { ...prev, focusedPanelId: existing.id };
          saveState(next);
          return next;
        }

        const newPanel: WorkspacePanel = {
          id: crypto.randomUUID(),
          sessionId,
          projectSlug,
        };
        const next = {
          panels: [...prev.panels, newPanel],
          focusedPanelId: newPanel.id,
        };
        saveState(next);
        return next;
      });
    },
    []
  );

  const openNewSession = React.useCallback((projectSlug?: string): string => {
    const panelId = crypto.randomUUID();
    setState((prev) => {
      const newPanel: WorkspacePanel = {
        id: panelId,
        sessionId: null,
        projectSlug,
      };
      const next = {
        panels: [...prev.panels, newPanel],
        focusedPanelId: newPanel.id,
      };
      saveState(next);
      return next;
    });
    return panelId;
  }, []);

  const closePanel = React.useCallback(
    (panelId: string) => {
      setState((prev) => {
        const idx = prev.panels.findIndex((p) => p.id === panelId);
        if (idx === -1) return prev;

        const remaining = prev.panels.filter((p) => p.id !== panelId);
        let nextFocused = prev.focusedPanelId;

        if (prev.focusedPanelId === panelId) {
          const neighbor =
            remaining[Math.min(idx, remaining.length - 1)] ?? null;
          nextFocused = neighbor?.id ?? null;
        }

        const next = { panels: remaining, focusedPanelId: nextFocused };
        saveState(next);

        // Navigate away if no panels left
        if (remaining.length === 0) {
          router.push("/");
        }

        return next;
      });
    },
    [router]
  );

  const focusPanel = React.useCallback((panelId: string) => {
    setState((prev) => {
      if (prev.focusedPanelId === panelId) return prev;
      const next = { ...prev, focusedPanelId: panelId };
      saveState(next);
      return next;
    });
  }, []);

  const updatePanelSession = React.useCallback(
    (panelId: string, sessionId: string) => {
      setState((prev) => {
        const panel = prev.panels.find((p) => p.id === panelId);
        if (!panel || panel.sessionId === sessionId) return prev;
        const next = {
          ...prev,
          panels: prev.panels.map((p) =>
            p.id === panelId ? { ...p, sessionId } : p
          ),
        };
        saveState(next);
        return next;
      });
    },
    []
  );

  // ── Keyboard shortcuts ──────────────────────────────────────────────────

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      // Cmd+W: close focused panel (only when workspace is active)
      if (e.key === "w" && state.focusedPanelId && state.panels.length > 0) {
        e.preventDefault();
        closePanel(state.focusedPanelId);
        return;
      }

      // Cmd+[ / Cmd+]: cycle focus between panels
      if ((e.key === "[" || e.key === "]") && state.panels.length > 1) {
        e.preventDefault();
        const currentIdx = state.panels.findIndex(
          (p) => p.id === state.focusedPanelId
        );
        const direction = e.key === "]" ? 1 : -1;
        const nextIdx =
          (currentIdx + direction + state.panels.length) % state.panels.length;
        focusPanel(state.panels[nextIdx].id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.panels, state.focusedPanelId, closePanel, focusPanel]);

  // ── Context value ──────────────────────────────────────────────────────

  const contextValue = React.useMemo<WorkspaceContextProps>(
    () => ({
      panels: state.panels,
      focusedPanelId: state.focusedPanelId,
      hasPanels,
      openSession,
      openNewSession,
      closePanel,
      focusPanel,
      updatePanelSession,
    }),
    [
      state.panels,
      state.focusedPanelId,
      hasPanels,
      openSession,
      openNewSession,
      closePanel,
      focusPanel,
      updatePanelSession,
    ]
  );

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
}
