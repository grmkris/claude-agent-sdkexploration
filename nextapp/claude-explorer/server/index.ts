/**
 * terminal-ws-server.ts  — standalone entrypoint
 *
 * Runs a WebSocket server on WS_PORT (default 3001) that provides
 * interactive shell access to this container via a PTY.
 *
 * Started by entrypoint.sh alongside the Next.js process.
 * The Next.js frontend connects to ws://localhost:3001 (or the
 * TERMINAL_WS_URL env var if a reverse proxy rewrites the path).
 */

import { WebSocketServer } from "ws";

import { setupTerminalWs } from "./terminal-ws-server";

const port = Number(process.env.WS_PORT ?? 3001);

const wss = new WebSocketServer({
  port,
  // Allow connections from the same origin only (browser enforces this;
  // server-side we just accept all since it's internal)
  perMessageDeflate: false,
});

setupTerminalWs(wss);

console.log(`[terminal-ws] WebSocket PTY server listening on port ${port}`);
