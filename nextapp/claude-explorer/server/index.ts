/**
 * server/index.ts — Public-facing reverse proxy + WebSocket terminal
 *
 * Listens on $PORT (default 8080, the Railway-exposed port) and:
 *   • Proxies all regular HTTP → Next.js on port 3000 (internal)
 *   • Intercepts WebSocket upgrades to /api/terminal-ws and handles
 *     them with the PTY bridge directly — no extra exposed port needed.
 *
 * The browser always connects to the same public host:port for both
 * the web UI and the terminal WebSocket.
 */

import { createServer } from "node:http";
import { request as httpRequest } from "node:http";
import { WebSocketServer } from "ws";

import { setupTerminalWs } from "./terminal-ws-server";

const publicPort = Number(process.env.PORT ?? 8080);
const nextPort = 3000; // Next.js always on internal port 3000

// ── HTTP reverse proxy ────────────────────────────────────────────────────────

const server = createServer((req, res) => {
  const proxy = httpRequest(
    {
      hostname: "127.0.0.1",
      port: nextPort,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxy.on("error", (err) => {
    console.error("[proxy] HTTP error:", err.message);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end("Bad Gateway");
    }
  });

  req.pipe(proxy, { end: true });
});

// ── WebSocket upgrades ────────────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
setupTerminalWs(wss);

server.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith("/api/terminal-ws")) {
    // Terminal: handle locally with PTY bridge
    wss.handleUpgrade(req, socket as never, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    // All other WS (e.g. Next.js HMR in dev): proxy to Next.js
    const proxyReq = httpRequest({
      hostname: "127.0.0.1",
      port: nextPort,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        connection: "Upgrade",
        upgrade: req.headers.upgrade ?? "websocket",
      },
    });

    proxyReq.on("upgrade", (_proxyRes, proxySocket, proxyHead) => {
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          `upgrade: ${req.headers.upgrade ?? "websocket"}\r\n` +
          "connection: Upgrade\r\n\r\n"
      );
      if (proxyHead.length) proxySocket.unshift(proxyHead);
      proxySocket.pipe(socket as never);
      (socket as never as NodeJS.ReadableStream).pipe(proxySocket);
    });

    proxyReq.on("error", () => socket.destroy());
    proxyReq.end();
  }
});

server.listen(publicPort, "0.0.0.0", () => {
  console.log(`[proxy] Listening on :${publicPort} → Next.js on :${nextPort}`);
});
