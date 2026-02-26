"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { useIsMobile } from "@/hooks/use-mobile";

const TAB_BAR_COOKIE_NAME = "agent_tab_bar_state";
const TAB_BAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const TAB_BAR_KEYBOARD_SHORTCUT = "j"; // Cmd+J / Ctrl+J
const STORAGE_KEY = "agent-tabs";

type TabState = {
  openTabs: string[];
  pinnedTabs: string[];
};

type AgentTabContextProps = {
  openTabs: string[];
  pinnedTabs: string[];
  activeTab: string | null;
  visible: boolean;
  isMobile: boolean;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  openTab: (sessionId: string) => void;
  closeTab: (sessionId: string) => void;
  pinTab: (sessionId: string) => void;
  unpinTab: (sessionId: string) => void;
  toggleVisibility: () => void;
};

const AgentTabContext = React.createContext<AgentTabContextProps | null>(null);

export function useAgentTabs() {
  const context = React.useContext(AgentTabContext);
  if (!context) {
    throw new Error("useAgentTabs must be used within an AgentTabProvider.");
  }
  return context;
}

function loadState(): TabState {
  if (typeof window === "undefined") return { openTabs: [], pinnedTabs: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as TabState;
  } catch {}
  return { openTabs: [], pinnedTabs: [] };
}

function saveState(state: TabState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

/** Extract session ID from pathname like /chat/:id or /project/:slug/chat/:id */
function extractSessionId(pathname: string): string | null {
  const match = pathname.match(/\/chat\/([a-f0-9-]+)/);
  return match?.[1] ?? null;
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
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [visible, _setVisible] = React.useState(defaultVisible);
  const [tabState, setTabState] = React.useState<TabState>(loadState);

  const activeTab = extractSessionId(pathname);

  // Auto-add tab when navigating to a session
  React.useEffect(() => {
    if (!activeTab) return;
    setTabState((prev) => {
      if (prev.openTabs.includes(activeTab) || prev.pinnedTabs.includes(activeTab))
        return prev;
      const next = { ...prev, openTabs: [...prev.openTabs, activeTab] };
      saveState(next);
      return next;
    });
  }, [activeTab]);

  const setVisible = React.useCallback(
    (value: boolean) => {
      _setVisible(value);
      document.cookie = `${TAB_BAR_COOKIE_NAME}=${value}; path=/; max-age=${TAB_BAR_COOKIE_MAX_AGE}`;
    },
    []
  );

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

  const openTab = React.useCallback((sessionId: string) => {
    setTabState((prev) => {
      if (prev.openTabs.includes(sessionId) || prev.pinnedTabs.includes(sessionId))
        return prev;
      const next = { ...prev, openTabs: [...prev.openTabs, sessionId] };
      saveState(next);
      return next;
    });
  }, []);

  const closeTab = React.useCallback((sessionId: string) => {
    setTabState((prev) => {
      const next = {
        openTabs: prev.openTabs.filter((id) => id !== sessionId),
        pinnedTabs: prev.pinnedTabs.filter((id) => id !== sessionId),
      };
      saveState(next);
      return next;
    });
  }, []);

  const pinTab = React.useCallback((sessionId: string) => {
    setTabState((prev) => {
      if (prev.pinnedTabs.includes(sessionId)) return prev;
      const next = {
        openTabs: prev.openTabs.filter((id) => id !== sessionId),
        pinnedTabs: [...prev.pinnedTabs, sessionId],
      };
      saveState(next);
      return next;
    });
  }, []);

  const unpinTab = React.useCallback((sessionId: string) => {
    setTabState((prev) => {
      if (!prev.pinnedTabs.includes(sessionId)) return prev;
      const next = {
        pinnedTabs: prev.pinnedTabs.filter((id) => id !== sessionId),
        openTabs: [...prev.openTabs, sessionId],
      };
      saveState(next);
      return next;
    });
  }, []);

  const contextValue = React.useMemo<AgentTabContextProps>(
    () => ({
      openTabs: tabState.openTabs,
      pinnedTabs: tabState.pinnedTabs,
      activeTab,
      visible,
      isMobile,
      mobileOpen,
      setMobileOpen,
      openTab,
      closeTab,
      pinTab,
      unpinTab,
      toggleVisibility,
    }),
    [
      tabState,
      activeTab,
      visible,
      isMobile,
      mobileOpen,
      openTab,
      closeTab,
      pinTab,
      unpinTab,
      toggleVisibility,
    ]
  );

  return (
    <AgentTabContext.Provider value={contextValue}>
      {children}
    </AgentTabContext.Provider>
  );
}
