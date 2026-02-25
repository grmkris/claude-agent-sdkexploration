import { EventEmitter } from "node:events";

export type SessionStateEvent = {
  sessionId: string;
  state: string;
  currentTool?: string | null;
  projectPath?: string | null;
};

export function getSessionEventBus(): EventEmitter {
  const g = globalThis as { __explorerEventBus?: EventEmitter };
  if (!g.__explorerEventBus) {
    g.__explorerEventBus = new EventEmitter();
    g.__explorerEventBus.setMaxListeners(100);
  }
  return g.__explorerEventBus;
}
