"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { client } from "./orpc-client";

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
  activeGroupId: string | null;
  activeGroupName: string | null;
};

type WorkspaceContextProps = {
  panels: WorkspacePanel[];
  focusedPanelId: string | null;
  hasPanels: boolean;
  activeGroupId: string | null;
  activeGroupName: string | null;
  /** Additive — adds panel alongside existing ones (for split view) */
  openSession: (sessionId: string, projectSlug?: string) => void;
  /** Additive — adds new-session panel alongside existing ones */
  openNewSession: (projectSlug?: string) => string; // returns panelId
  /** Additive — adds panel, auto-creates group when going multi-panel */
  openNewPanel: (projectSlug?: string) => string; // returns panelId
  /** Replace — clears all panels, shows single session */
  replaceSession: (sessionId: string, projectSlug?: string) => void;
  /** Replace — clears all panels, shows single new session */
  replaceNewSession: (projectSlug?: string) => string; // returns panelId
  closePanel: (panelId: string) => void;
  focusPanel: (panelId: string) => void;
  updatePanelSession: (panelId: string, sessionId: string) => void;
  /** Load a workspace group — fetches sessions and populates panels */
  loadGroup: (groupId: string, projectSlug?: string) => Promise<void>;
  /** Clear the active group without closing panels */
  clearGroup: () => void;
  /** Save current panels as a new workspace group */
  saveAsGroup: (name: string, projectPath?: string) => Promise<string>;
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "workspace-panels-v2";

function loadState(): WorkspaceState {
  if (typeof window === "undefined")
    return {
      panels: [],
      focusedPanelId: null,
      activeGroupId: null,
      activeGroupName: null,
    };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WorkspaceState;
      return {
        panels: parsed.panels ?? [],
        focusedPanelId: parsed.focusedPanelId ?? null,
        activeGroupId: parsed.activeGroupId ?? null,
        activeGroupName: parsed.activeGroupName ?? null,
      };
    }
  } catch {}
  return {
    panels: [],
    focusedPanelId: null,
    activeGroupId: null,
    activeGroupName: null,
  };
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

  // ── Helper: sync session add to active group ───────────────────────────

  const syncAddToGroup = React.useCallback(
    (groupId: string | null, sessionId: string | null) => {
      if (!groupId || !sessionId) return;
      client.workspaceGroups.addSession({ groupId, sessionId }).catch(() => {});
    },
    []
  );

  const syncRemoveFromGroup = React.useCallback(
    (groupId: string | null, sessionId: string | null) => {
      if (!groupId || !sessionId) return;
      client.workspaceGroups
        .removeSession({ groupId, sessionId })
        .catch(() => {});
    },
    []
  );

  // ── Panel operations ────────────────────────────────────────────────────

  const openSession = React.useCallback(
    (sessionId: string, projectSlug?: string) => {
      setState((prev) => {
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
          ...prev,
          panels: [...prev.panels, newPanel],
          focusedPanelId: newPanel.id,
        };
        saveState(next);
        syncAddToGroup(prev.activeGroupId, sessionId);
        return next;
      });
    },
    [syncAddToGroup]
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
        ...prev,
        panels: [...prev.panels, newPanel],
        focusedPanelId: newPanel.id,
      };
      saveState(next);
      return next;
    });
    return panelId;
  }, []);

  const openNewPanel = React.useCallback((projectSlug?: string): string => {
    const panelId = crypto.randomUUID();
    let shouldCreateGroup = false;
    let existingSessions: string[] = [];
    let groupName = "";

    setState((prev) => {
      const newPanel: WorkspacePanel = {
        id: panelId,
        sessionId: null,
        projectSlug,
      };
      const newPanels = [...prev.panels, newPanel];

      if (prev.panels.length >= 1 && !prev.activeGroupId) {
        shouldCreateGroup = true;
        groupName = `Workspace ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        existingSessions = prev.panels
          .filter((p) => p.sessionId)
          .map((p) => p.sessionId!);

        const next: WorkspaceState = {
          panels: newPanels,
          focusedPanelId: newPanel.id,
          activeGroupId: null,
          activeGroupName: groupName,
        };
        saveState(next);
        return next;
      }

      const next = {
        ...prev,
        panels: newPanels,
        focusedPanelId: newPanel.id,
      };
      saveState(next);
      return next;
    });

    if (shouldCreateGroup) {
      client.workspaceGroups
        .create({ name: groupName })
        .then(({ id: groupId }) => {
          existingSessions.forEach((sid, i) => {
            client.workspaceGroups
              .addSession({ groupId, sessionId: sid, position: i })
              .catch(() => {});
          });
          setState((current) => {
            const next = {
              ...current,
              activeGroupId: groupId,
              activeGroupName: groupName,
            };
            saveState(next);
            return next;
          });
        })
        .catch(() => {});
    }

    return panelId;
  }, []);

  const replaceSession = React.useCallback(
    (sessionId: string, projectSlug?: string) => {
      setState((prev) => {
        if (
          prev.panels.length === 1 &&
          prev.panels[0].sessionId === sessionId
        ) {
          if (prev.focusedPanelId === prev.panels[0].id) return prev;
          const next = { ...prev, focusedPanelId: prev.panels[0].id };
          saveState(next);
          return next;
        }

        const newPanel: WorkspacePanel = {
          id: crypto.randomUUID(),
          sessionId,
          projectSlug,
        };
        const next: WorkspaceState = {
          panels: [newPanel],
          focusedPanelId: newPanel.id,
          activeGroupId: null,
          activeGroupName: null,
        };
        saveState(next);
        return next;
      });
    },
    []
  );

  const replaceNewSession = React.useCallback(
    (projectSlug?: string): string => {
      const panelId = crypto.randomUUID();
      setState(() => {
        const newPanel: WorkspacePanel = {
          id: panelId,
          sessionId: null,
          projectSlug,
        };
        const next: WorkspaceState = {
          panels: [newPanel],
          focusedPanelId: newPanel.id,
          activeGroupId: null,
          activeGroupName: null,
        };
        saveState(next);
        return next;
      });
      return panelId;
    },
    []
  );

  const closePanel = React.useCallback(
    (panelId: string) => {
      setState((prev) => {
        const panel = prev.panels.find((p) => p.id === panelId);
        const idx = prev.panels.findIndex((p) => p.id === panelId);
        if (idx === -1) return prev;

        // Sync removal from active group
        if (panel?.sessionId) {
          syncRemoveFromGroup(prev.activeGroupId, panel.sessionId);
        }

        const remaining = prev.panels.filter((p) => p.id !== panelId);
        let nextFocused = prev.focusedPanelId;

        if (prev.focusedPanelId === panelId) {
          const neighbor =
            remaining[Math.min(idx, remaining.length - 1)] ?? null;
          nextFocused = neighbor?.id ?? null;
        }

        // Clear group if no panels left
        const next: WorkspaceState = {
          ...prev,
          panels: remaining,
          focusedPanelId: nextFocused,
          activeGroupId: remaining.length === 0 ? null : prev.activeGroupId,
          activeGroupName: remaining.length === 0 ? null : prev.activeGroupName,
        };
        saveState(next);

        if (remaining.length === 0) {
          router.push("/");
        }

        return next;
      });
    },
    [router, syncRemoveFromGroup]
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

        // Sync: remove old session from group, add new one
        if (panel.sessionId) {
          syncRemoveFromGroup(prev.activeGroupId, panel.sessionId);
        }
        syncAddToGroup(prev.activeGroupId, sessionId);

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
    [syncAddToGroup, syncRemoveFromGroup]
  );

  // ── Group operations ──────────────────────────────────────────────────

  const loadGroup = React.useCallback(
    async (groupId: string, projectSlug?: string) => {
      const group = await client.workspaceGroups.get({ id: groupId });
      if (!group) return;

      const panels: WorkspacePanel[] = group.sessions.map((s) => ({
        id: crypto.randomUUID(),
        sessionId: s.sessionId,
        projectSlug,
      }));

      // Ensure at least one panel
      if (panels.length === 0) {
        panels.push({ id: crypto.randomUUID(), sessionId: null });
      }

      const next: WorkspaceState = {
        panels,
        focusedPanelId: panels[0].id,
        activeGroupId: group.id,
        activeGroupName: group.name,
      };
      setState(next);
      saveState(next);
    },
    []
  );

  const clearGroup = React.useCallback(() => {
    setState((prev) => {
      const next = { ...prev, activeGroupId: null, activeGroupName: null };
      saveState(next);
      return next;
    });
  }, []);

  const saveAsGroup = React.useCallback(
    async (name: string, projectPath?: string): Promise<string> => {
      const { id } = await client.workspaceGroups.create({ name, projectPath });

      // Add all current sessions with real IDs
      const sessionsToAdd = state.panels
        .filter((p) => p.sessionId)
        .map((p, i) => ({ sessionId: p.sessionId!, position: i }));

      await Promise.all(
        sessionsToAdd.map((s) =>
          client.workspaceGroups.addSession({
            groupId: id,
            sessionId: s.sessionId,
            position: s.position,
          })
        )
      );

      setState((prev) => {
        const next = { ...prev, activeGroupId: id, activeGroupName: name };
        saveState(next);
        return next;
      });

      return id;
    },
    [state.panels]
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

      // Cmd+\: split — open new panel alongside current
      if (e.key === "\\" && state.panels.length > 0) {
        e.preventDefault();
        const current = state.panels.find((p) => p.id === state.focusedPanelId);
        openNewPanel(current?.projectSlug);
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
  }, [
    state.panels,
    state.focusedPanelId,
    closePanel,
    focusPanel,
    openNewPanel,
  ]);

  // ── Context value ──────────────────────────────────────────────────────

  const contextValue = React.useMemo<WorkspaceContextProps>(
    () => ({
      panels: state.panels,
      focusedPanelId: state.focusedPanelId,
      hasPanels,
      activeGroupId: state.activeGroupId,
      activeGroupName: state.activeGroupName,
      openSession,
      openNewSession,
      openNewPanel,
      replaceSession,
      replaceNewSession,
      closePanel,
      focusPanel,
      updatePanelSession,
      loadGroup,
      clearGroup,
      saveAsGroup,
    }),
    [
      state.panels,
      state.focusedPanelId,
      hasPanels,
      state.activeGroupId,
      state.activeGroupName,
      openSession,
      openNewSession,
      openNewPanel,
      replaceSession,
      replaceNewSession,
      closePanel,
      focusPanel,
      updatePanelSession,
      loadGroup,
      clearGroup,
      saveAsGroup,
    ]
  );

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
}
