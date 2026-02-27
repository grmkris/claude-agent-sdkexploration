"use client";

import * as React from "react";

type CompactCtx = {
  onCompact: (() => void) | null;
  register: (sessionId: string, fn: () => void) => void;
  unregister: (sessionId: string) => void;
};

const CompactContext = React.createContext<CompactCtx>({
  onCompact: null,
  register: () => {},
  unregister: () => {},
});

export function CompactProvider({ children }: { children: React.ReactNode }) {
  const registry = React.useRef(new Map<string, () => void>());
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const register = React.useCallback((id: string, fn: () => void) => {
    registry.current.set(id, fn);
    setActiveId(id);
  }, []);

  const unregister = React.useCallback((id: string) => {
    registry.current.delete(id);
    setActiveId((prev) => (prev === id ? null : prev));
  }, []);

  const onCompact = activeId ? (registry.current.get(activeId) ?? null) : null;

  return (
    <CompactContext.Provider value={{ onCompact, register, unregister }}>
      {children}
    </CompactContext.Provider>
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
