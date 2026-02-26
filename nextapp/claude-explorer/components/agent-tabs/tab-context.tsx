"use client";

import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { useIsMobile } from "@/hooks/use-mobile";

const TAB_BAR_COOKIE_NAME = "agent_tab_bar_state";
const TAB_BAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const TAB_BAR_KEYBOARD_SHORTCUT = "j"; // Cmd+J / Ctrl+J
const STORAGE_KEY = "agent-tabs-v2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TabType = "session" | "project" | "page";

export type Tab = {
  id: string;
  url: string;
  title: string;
  type: TabType;
  sessionId?: string;
  projectSlug?: string;
  pinned: boolean;
};

type TabState = {
  tabs: Tab[];
  activeTabId: string | null;
};

type AgentTabContextProps = {
  tabs: Tab[];
  pinnedTabs: Tab[];
  openTabs: Tab[];
  activeTab: Tab | null;
  visible: boolean;
  isMobile: boolean;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  openTab: (tab: Omit<Tab, "id" | "pinned">) => void;
  closeTab: (tabId: string) => void;
  pinTab: (tabId: string) => void;
  unpinTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  toggleVisibility: () => void;
  closeActiveTab: () => void;
  cycleTab: (direction: 1 | -1) => void;
};

// ---------------------------------------------------------------------------
// Static page titles for non-session/project pages
// ---------------------------------------------------------------------------

const PAGE_TITLES: Record<string, string> = {
  "/analytics": "Analytics",
  "/keys": "Keys",
  "/mcps": "MCPs",
  "/email": "Email",
  "/webhooks": "Webhooks",
  "/crons": "Crons",
  "/tmux": "Tmux",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "") || "/";
}

/** Extract session ID from pathname like /chat/:id or /project/:slug/chat/:id */
export function extractSessionId(url: string): string | null {
  const match = url.match(/\/chat\/([a-f0-9-]+)/);
  return match?.[1] ?? null;
}

/** Extract project slug from /project/:slug or /project/:slug/... */
function extractProjectSlug(url: string): string | null {
  const match = url.match(/\/project\/([^/]+)/);
  return match?.[1] ?? null;
}

/** Derive tab info from a pathname. */
export function resolveTabInfo(pathname: string): {
  type: TabType;
  title: string;
  sessionId?: string;
  projectSlug?: string;
} | null {
  const normalized = normalizeUrl(pathname);

  // Home — never auto-tab
  if (normalized === "/") return null;

  // Session pages
  const sessionId = extractSessionId(normalized);
  if (sessionId) {
    const projectSlug = extractProjectSlug(normalized);
    return {
      type: "session",
      title: "Session starting...",
      sessionId,
      projectSlug: projectSlug ?? undefined,
    };
  }

  // Project home pages (but NOT sub-pages like /project/slug/crons)
  const projectSlug = extractProjectSlug(normalized);
  if (projectSlug) {
    // /project/:slug exactly (no further path segments)
    const segments = normalized.split("/").filter(Boolean);
    if (segments.length === 2) {
      return {
        type: "project",
        title: projectSlug,
        projectSlug,
      };
    }
    // Project sub-pages like /project/slug/crons
    const subPage = segments[2];
    const subTitle = subPage
      ? subPage.charAt(0).toUpperCase() + subPage.slice(1)
      : "Page";
    return {
      type: "page",
      title: `${projectSlug} / ${subTitle}`,
      projectSlug,
    };
  }

  // Global pages
  const pageTitle = PAGE_TITLES[normalized];
  if (pageTitle) {
    return { type: "page", title: pageTitle };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function loadState(): TabState {
  if (typeof window === "undefined") return { tabs: [], activeTabId: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as TabState;
  } catch {}
  return { tabs: [], activeTabId: null };
}

function saveState(state: TabState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AgentTabContext = React.createContext<AgentTabContextProps | null>(null);

export function useAgentTabs() {
  const context = React.useContext(AgentTabContext);
  if (!context) {
    throw new Error("useAgentTabs must be used within an AgentTabProvider.");
  }
  return context;
}

export function AgentTabProvider({
  defaultVisible = true,
  children,
}: {
  defaultVisible?: boolean;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [visible, _setVisible] = React.useState(defaultVisible);
  const [tabState, setTabState] = React.useState<TabState>(loadState);

  // Derived
  const pinnedTabs = React.useMemo(
    () => tabState.tabs.filter((t) => t.pinned),
    [tabState.tabs]
  );
  const openTabs = React.useMemo(
    () => tabState.tabs.filter((t) => !t.pinned),
    [tabState.tabs]
  );
  const activeTab = React.useMemo(
    () => tabState.tabs.find((t) => t.id === tabState.activeTabId) ?? null,
    [tabState]
  );

  // ---------------------------------------------------------------------------
  // Auto-sync activeTabId with current pathname
  // Auto-add session tabs on navigation
  // ---------------------------------------------------------------------------
  React.useEffect(() => {
    const normalized = normalizeUrl(pathname);

    setTabState((prev) => {
      // Find existing tab matching this URL or session
      const sessionId = extractSessionId(normalized);
      let existingTab = prev.tabs.find(
        (t) => normalizeUrl(t.url) === normalized
      );

      // Session dedup: check by sessionId if no exact URL match
      if (!existingTab && sessionId) {
        existingTab = prev.tabs.find((t) => t.sessionId === sessionId);
        if (existingTab) {
          // Update URL to prefer project-scoped
          const projectSlug = extractProjectSlug(normalized);
          if (projectSlug && !existingTab.projectSlug) {
            const updated = prev.tabs.map((t) =>
              t.id === existingTab!.id
                ? { ...t, url: normalized, projectSlug }
                : t
            );
            const next = { tabs: updated, activeTabId: existingTab.id };
            saveState(next);
            return next;
          }
          // Just activate
          if (prev.activeTabId === existingTab.id) return prev;
          const next = { ...prev, activeTabId: existingTab.id };
          saveState(next);
          return next;
        }
      }

      if (existingTab) {
        if (prev.activeTabId === existingTab.id) return prev;
        const next = { ...prev, activeTabId: existingTab.id };
        saveState(next);
        return next;
      }

      // Auto-add for session pages only
      if (!sessionId) return prev;

      const info = resolveTabInfo(normalized);
      if (!info) return prev;

      const newTab: Tab = {
        id: crypto.randomUUID(),
        url: normalized,
        title: info.title,
        type: info.type,
        sessionId: info.sessionId,
        projectSlug: info.projectSlug,
        pinned: false,
      };
      const next = {
        tabs: [...prev.tabs, newTab],
        activeTabId: newTab.id,
      };
      saveState(next);
      return next;
    });
  }, [pathname]);

  // ---------------------------------------------------------------------------
  // Visibility
  // ---------------------------------------------------------------------------
  const setVisible = React.useCallback((value: boolean) => {
    _setVisible(value);
    document.cookie = `${TAB_BAR_COOKIE_NAME}=${value}; path=/; max-age=${TAB_BAR_COOKIE_MAX_AGE}`;
  }, []);

  const toggleVisibility = React.useCallback(() => {
    if (isMobile) {
      setMobileOpen((prev) => !prev);
    } else {
      setVisible(!visible);
    }
  }, [isMobile, visible, setVisible]);

  // Keyboard shortcut: Cmd+J / Ctrl+J
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === TAB_BAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleVisibility();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleVisibility]);

  // ---------------------------------------------------------------------------
  // Tab mutations
  // ---------------------------------------------------------------------------
  const openTab = React.useCallback((partial: Omit<Tab, "id" | "pinned">) => {
    setTabState((prev) => {
      const normalized = normalizeUrl(partial.url);

      // Dedup by URL
      const existing = prev.tabs.find(
        (t) => normalizeUrl(t.url) === normalized
      );
      if (existing) {
        if (prev.activeTabId === existing.id) return prev;
        const next = { ...prev, activeTabId: existing.id };
        saveState(next);
        return next;
      }

      // Dedup by sessionId
      if (partial.sessionId) {
        const bySid = prev.tabs.find((t) => t.sessionId === partial.sessionId);
        if (bySid) {
          // Prefer project-scoped URL
          const updated =
            partial.projectSlug && !bySid.projectSlug
              ? prev.tabs.map((t) =>
                  t.id === bySid.id
                    ? {
                        ...t,
                        url: normalized,
                        projectSlug: partial.projectSlug,
                      }
                    : t
                )
              : prev.tabs;
          const next = { tabs: updated, activeTabId: bySid.id };
          saveState(next);
          return next;
        }
      }

      const newTab: Tab = {
        ...partial,
        id: crypto.randomUUID(),
        url: normalized,
        pinned: false,
      };
      const next = {
        tabs: [...prev.tabs, newTab],
        activeTabId: newTab.id,
      };
      saveState(next);
      return next;
    });
  }, []);

  const closeTab = React.useCallback(
    (tabId: string) => {
      setTabState((prev) => {
        const idx = prev.tabs.findIndex((t) => t.id === tabId);
        if (idx === -1) return prev;

        const remaining = prev.tabs.filter((t) => t.id !== tabId);
        let nextActiveId = prev.activeTabId;

        if (prev.activeTabId === tabId) {
          // Activate next tab to the right, or left, or null
          const nextTab =
            remaining[Math.min(idx, remaining.length - 1)] ?? null;
          nextActiveId = nextTab?.id ?? null;

          // Navigate to the next tab or home
          if (nextTab) {
            router.push(nextTab.url);
          } else {
            router.push("/");
          }
        }

        const next = { tabs: remaining, activeTabId: nextActiveId };
        saveState(next);
        return next;
      });
    },
    [router]
  );

  const closeActiveTab = React.useCallback(() => {
    if (tabState.activeTabId) {
      closeTab(tabState.activeTabId);
    }
  }, [tabState.activeTabId, closeTab]);

  const pinTab = React.useCallback((tabId: string) => {
    setTabState((prev) => {
      const tab = prev.tabs.find((t) => t.id === tabId);
      if (!tab || tab.pinned) return prev;

      // Move to end of pinned section
      const withoutTab = prev.tabs.filter((t) => t.id !== tabId);
      const pinnedCount = withoutTab.filter((t) => t.pinned).length;
      const pinned = { ...tab, pinned: true };
      const updated = [
        ...withoutTab.slice(0, pinnedCount),
        pinned,
        ...withoutTab.slice(pinnedCount),
      ];

      const next = { ...prev, tabs: updated };
      saveState(next);
      return next;
    });
  }, []);

  const unpinTab = React.useCallback((tabId: string) => {
    setTabState((prev) => {
      const tab = prev.tabs.find((t) => t.id === tabId);
      if (!tab || !tab.pinned) return prev;

      // Move to start of unpinned section
      const withoutTab = prev.tabs.filter((t) => t.id !== tabId);
      const pinnedCount = withoutTab.filter((t) => t.pinned).length;
      const unpinned = { ...tab, pinned: false };
      const updated = [
        ...withoutTab.slice(0, pinnedCount),
        unpinned,
        ...withoutTab.slice(pinnedCount),
      ];

      const next = { ...prev, tabs: updated };
      saveState(next);
      return next;
    });
  }, []);

  const setActiveTab = React.useCallback((tabId: string) => {
    setTabState((prev) => {
      if (prev.activeTabId === tabId) return prev;
      const next = { ...prev, activeTabId: tabId };
      saveState(next);
      return next;
    });
  }, []);

  const updateTabTitle = React.useCallback((tabId: string, title: string) => {
    setTabState((prev) => {
      const tab = prev.tabs.find((t) => t.id === tabId);
      if (!tab || tab.title === title) return prev;
      const next = {
        ...prev,
        tabs: prev.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
      };
      saveState(next);
      return next;
    });
  }, []);

  const cycleTab = React.useCallback(
    (direction: 1 | -1) => {
      setTabState((prev) => {
        if (prev.tabs.length === 0) return prev;
        const currentIdx = prev.tabs.findIndex(
          (t) => t.id === prev.activeTabId
        );
        const nextIdx =
          (currentIdx + direction + prev.tabs.length) % prev.tabs.length;
        const nextTab = prev.tabs[nextIdx];
        router.push(nextTab.url);
        const next = { ...prev, activeTabId: nextTab.id };
        saveState(next);
        return next;
      });
    },
    [router]
  );

  // ---------------------------------------------------------------------------
  // Context value
  // ---------------------------------------------------------------------------
  const contextValue = React.useMemo<AgentTabContextProps>(
    () => ({
      tabs: tabState.tabs,
      pinnedTabs,
      openTabs,
      activeTab,
      visible,
      isMobile,
      mobileOpen,
      setMobileOpen,
      openTab,
      closeTab,
      pinTab,
      unpinTab,
      setActiveTab,
      updateTabTitle,
      toggleVisibility,
      closeActiveTab,
      cycleTab,
    }),
    [
      tabState.tabs,
      pinnedTabs,
      openTabs,
      activeTab,
      visible,
      isMobile,
      mobileOpen,
      openTab,
      closeTab,
      pinTab,
      unpinTab,
      setActiveTab,
      updateTabTitle,
      toggleVisibility,
      closeActiveTab,
      cycleTab,
    ]
  );

  return (
    <AgentTabContext.Provider value={contextValue}>
      {children}
    </AgentTabContext.Provider>
  );
}
