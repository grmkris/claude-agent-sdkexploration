"use client";

import * as React from "react";

type CompactCtx = {
  onCompact: (() => void) | null;
  register: (sessionId: string, fn: () => void) => void;
  unregister: (sessionId: string) => void;
  // ── Send message registry ──────────────────────────────────────────────
  /** Send a prompt to a mounted session. Returns true if the session was found. */
  sendToSession: (sessionId: string, prompt: string) => boolean;
  /** Register a send function for a mounted session */
  registerSend: (sessionId: string, fn: (prompt: string) => void) => void;
  /** Unregister a send function for a mounted session */
  unregisterSend: (sessionId: string) => void;
  /** All currently mounted session IDs that accept messages */
  mountedSessionIds: string[];
};

const CompactContext = React.createContext<CompactCtx>({
  onCompact: null,
  register: () => {},
  unregister: () => {},
  sendToSession: () => false,
  registerSend: () => {},
  unregisterSend: () => {},
  mountedSessionIds: [],
});

export function CompactProvider({ children }: { children: React.ReactNode }) {
  const registry = React.useRef(new Map<string, () => void>());
  const [activeId, setActiveId] = React.useState<string | null>(null);

  // ── Compact registry (existing) ──────────────────────────────────────────

  const register = React.useCallback((id: string, fn: () => void) => {
    registry.current.set(id, fn);
    setActiveId(id);
  }, []);

  const unregister = React.useCallback((id: string) => {
    registry.current.delete(id);
    setActiveId((prev) => (prev === id ? null : prev));
  }, []);

  const onCompact = activeId ? (registry.current.get(activeId) ?? null) : null;

  // ── Send registry (new) ──────────────────────────────────────────────────

  const sendRegistry = React.useRef(
    new Map<string, (prompt: string) => void>()
  );
  const [mountedSessionIds, setMountedSessionIds] = React.useState<string[]>(
    []
  );

  const registerSend = React.useCallback(
    (sessionId: string, fn: (prompt: string) => void) => {
      sendRegistry.current.set(sessionId, fn);
      setMountedSessionIds(Array.from(sendRegistry.current.keys()));
    },
    []
  );

  const unregisterSend = React.useCallback((sessionId: string) => {
    sendRegistry.current.delete(sessionId);
    setMountedSessionIds(Array.from(sendRegistry.current.keys()));
  }, []);

  const sendToSession = React.useCallback(
    (sessionId: string, prompt: string): boolean => {
      const fn = sendRegistry.current.get(sessionId);
      if (!fn) return false;
      fn(prompt);
      return true;
    },
    []
  );

  // ── Context value ──────────────────────────────────────────────────────

  const value = React.useMemo<CompactCtx>(
    () => ({
      onCompact,
      register,
      unregister,
      sendToSession,
      registerSend,
      unregisterSend,
      mountedSessionIds,
    }),
    [
      onCompact,
      register,
      unregister,
      sendToSession,
      registerSend,
      unregisterSend,
      mountedSessionIds,
    ]
  );

  return (
    <CompactContext.Provider value={value}>{children}</CompactContext.Provider>
  );
}

export function useCompact() {
  return React.useContext(CompactContext);
}

/** Used by session pages to register their compact (send "/compact") function */
export function useRegisterCompact(
  sessionId: string,
  fn: (() => void) | undefined
) {
  const { register, unregister } = useCompact();
  React.useEffect(() => {
    if (!fn) return;
    register(sessionId, fn);
    return () => unregister(sessionId);
  }, [sessionId, fn, register, unregister]);
}

/** Used by session pages to register their send function for receiving external messages */
export function useRegisterSend(
  sessionId: string,
  fn: ((prompt: string) => void) | undefined
) {
  const { registerSend, unregisterSend } = useCompact();
  React.useEffect(() => {
    if (!fn) return;
    registerSend(sessionId, fn);
    return () => unregisterSend(sessionId);
  }, [sessionId, fn, registerSend, unregisterSend]);
}
