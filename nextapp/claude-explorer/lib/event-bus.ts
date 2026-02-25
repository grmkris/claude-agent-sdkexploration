import { EventEmitter } from "node:events";

export type SessionStateEvent = {
  sessionId: string;
  state: string;
  currentTool?: string | null;
  projectPath?: string | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __explorerEventBus: EventEmitter | undefined;
}

export function getSessionEventBus(): EventEmitter {
  if (!globalThis.__explorerEventBus) {
    globalThis.__explorerEventBus = new EventEmitter();
    globalThis.__explorerEventBus.setMaxListeners(100);
  }
  return globalThis.__explorerEventBus;
}
