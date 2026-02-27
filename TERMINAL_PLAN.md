# Plan: Browser Terminal Access to Running Container

## Overview

Add a `/terminal` global page (and optionally a `/project/[slug]/terminal` sub-page) that provides
a full interactive shell inside the running container, rendered in the browser using **xterm.js**
over a **WebSocket** connection — all on the same port 3000 via a custom server.

---

## Architecture

```
Browser (xterm.js @xterm/xterm)
    │
    │  ws:// (same origin, path /api/terminal-ws)
    │  (HTTP upgrade on the same port 3000 — no second port!)
    │
Custom Bun server (server.ts)
    │  handles HTTP upgrade for /api/terminal-ws
    │  delegates all other HTTP to Next.js
    │
node-pty  ← spawns /bin/bash as user "bun"
    │      (we ARE already inside the container!)
    ▼
/bin/bash (inside the container, as user "bun")
```

### Key insight
The app runs **inside the container** already (see Dockerfile/entrypoint.sh).
We do NOT need `dockerode` or Docker socket access.
We just spawn `/bin/bash` with a pseudo-terminal (PTY) — exactly what **`node-pty`** does.

---

## Step-by-Step Implementation

### Step 1 — Install dependencies

```bash
cd nextapp/claude-explorer
bun add @xterm/xterm @xterm/addon-fit @xterm/addon-attach @xterm/addon-webgl @xterm/addon-web-links
bun add node-pty ws
bun add -d @types/node-pty @types/ws
```

### Step 2 — WebSocket + PTY handler (`lib/terminal-ws-server.ts`)

Create a module that exports `setupTerminalWs(wss: WebSocketServer)`:
- Listens for new WS connections
- Spawns a `node-pty` PTY process (`/bin/bash`) per connection, optionally in a `cwd`
- PTY stdout → `ws.send(data)` (binary buffer)
- WS message → try parse JSON for resize, else write to PTY stdin
- Clean up PTY on WS close; close WS when PTY exits

```typescript
// lib/terminal-ws-server.ts
import * as pty from "node-pty";
import type { WebSocketServer, WebSocket } from "ws";

export function setupTerminalWs(wss: WebSocketServer) {
  wss.on("connection", (ws: WebSocket, req) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const cwd = url.searchParams.get("cwd") ?? process.env.HOME ?? "/home/bun";

    const shell = pty.spawn("/bin/bash", [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd,
      env: { ...process.env, TERM: "xterm-256color" },
    });

    shell.onData((data) => {
      if (ws.readyState === 1 /* OPEN */) ws.send(data);
    });

    shell.onExit(() => ws.close());

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "resize" && msg.cols && msg.rows) {
          shell.resize(msg.cols, msg.rows);
          return;
        }
      } catch { /* not JSON — treat as raw input */ }
      shell.write(raw.toString());
    });

    ws.on("close", () => shell.kill());
  });
}
```

### Step 3 — Custom Bun/Node server (`server.ts`)

Create a custom server at the project root that:
1. Prepares the Next.js app
2. Creates an HTTP server that handles Next.js requests
3. Attaches a WebSocketServer to handle `/api/terminal-ws` upgrades

```typescript
// server.ts  (nextapp/claude-explorer/server.ts)
import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";
import { setupTerminalWs } from "./lib/terminal-ws-server";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  handle(req, res);
});

const wss = new WebSocketServer({ noServer: true });
setupTerminalWs(wss);

server.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith("/api/terminal-ws")) {
    wss.handleUpgrade(req, socket as any, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

server.listen(port, () => {
  console.log(`> Ready on http://localhost:${port}`);
});
```

### Step 4 — Update `entrypoint.sh`

Replace:
```bash
su bun -c "bun --bun next start -p ${PORT:-3000}" &
```
With:
```bash
su bun -c "bun server.ts" &
```

Also update `package.json` start script:
```json
"start": "bun server.ts"
```

### Step 5 — Terminal React component (`components/terminal/docker-terminal.tsx`)

A `"use client"` component that:
- Is always dynamically imported (`ssr: false`) to avoid SSR issues
- Initializes `Terminal` from `@xterm/xterm` with `FitAddon`, `WebglAddon`, `WebLinksAddon`
- Connects via native WebSocket to `/api/terminal-ws?cwd=<cwd>`
- Uses `@xterm/addon-attach` for the WS bridge
- Sends resize messages when FitAddon detects dimension changes
- Applies dark theme matching the app's color palette
- Disposes on unmount

```tsx
// components/terminal/docker-terminal.tsx
"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface Props {
  cwd?: string;
  className?: string;
}

export function DockerTerminal({ cwd, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "var(--font-geist-mono), 'Cascadia Code', Menlo, monospace",
      theme: { background: "#09090b", foreground: "#e4e4e7" }, // zinc-950 / zinc-200
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddon.fit();

    const wsUrl = new URL("/api/terminal-ws", window.location.href);
    wsUrl.protocol = wsUrl.protocol.replace("http", "ws");
    if (cwd) wsUrl.searchParams.set("cwd", cwd);

    const ws = new WebSocket(wsUrl.toString());

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };

    ws.onmessage = (e) => term.write(e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : e.data);
    ws.onclose = () => term.write("\r\n\x1b[31m[disconnected]\x1b[0m\r\n");

    term.onData((d) => ws.readyState === WebSocket.OPEN && ws.send(d));
    term.onResize(({ cols, rows }) => {
      ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "resize", cols, rows }));
    });

    const ro = new ResizeObserver(() => fitAddon.fit());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      ws.close();
      term.dispose();
    };
  }, [cwd]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%" }} />;
}
```

### Step 6 — Global terminal page (`app/terminal/page.tsx`)

```tsx
"use client";
import dynamic from "next/dynamic";

const DockerTerminal = dynamic(
  () => import("@/components/terminal/docker-terminal").then((m) => m.DockerTerminal),
  { ssr: false, loading: () => <div className="p-4 text-xs text-muted-foreground">Loading terminal…</div> }
);

export default function TerminalPage() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b px-4 py-3">
        <h1 className="text-sm font-semibold">Terminal</h1>
      </div>
      <div className="flex-1 overflow-hidden p-2">
        <DockerTerminal className="h-full w-full rounded border overflow-hidden" />
      </div>
    </div>
  );
}
```

### Step 7 — Add Terminal to global sidebar nav (`components/project-sidebar.tsx`)

Add to `GLOBAL_NAV` array (after "Tmux", or alongside it):

```typescript
{
  href: "/terminal",
  label: "Terminal",
  tooltip: "Container Terminal",
  icon: ComputerTerminal01Icon,  // already imported for Tmux entry
},
```

(Note: `ComputerTerminal01Icon` is already imported. We may use a different icon if preferred.)

### Step 8 (Optional) — Project-scoped terminal (`app/project/[slug]/terminal/page.tsx`)

Same as Step 6 but passes `cwd` from the project path:

```tsx
"use client";
import { use } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

const DockerTerminal = dynamic(
  () => import("@/components/terminal/docker-terminal").then((m) => m.DockerTerminal),
  { ssr: false }
);

export default function ProjectTerminalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const project = projects?.find((p) => p.slug === slug);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b px-4 py-3">
        <h1 className="text-sm font-semibold">Terminal</h1>
      </div>
      <div className="flex-1 overflow-hidden p-2">
        <DockerTerminal cwd={project?.path} className="h-full w-full rounded border overflow-hidden" />
      </div>
    </div>
  );
}
```

---

## File Summary

| File | Action |
|------|--------|
| `package.json` | Add `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-attach`, `@xterm/addon-webgl`, `@xterm/addon-web-links`, `node-pty`, `ws`, `@types/node-pty`, `@types/ws` |
| `server.ts` (new) | Custom Bun HTTP server with WS upgrade handler |
| `lib/terminal-ws-server.ts` (new) | WS handler: spawns node-pty bash, bridges I/O |
| `components/terminal/docker-terminal.tsx` (new) | xterm.js React component |
| `app/terminal/page.tsx` (new) | Global terminal page |
| `components/project-sidebar.tsx` | Add Terminal entry to `GLOBAL_NAV` |
| `entrypoint.sh` | Replace `bun --bun next start` with `bun server.ts` |
| `app/globals.css` | Add `@import "@xterm/xterm/css/xterm.css"` |
| `app/project/[slug]/terminal/page.tsx` (new, optional) | Project-scoped terminal |

---

## Notes

- **No second port needed** — WS upgrades are handled on the same port 3000 via HTTP upgrade
- **No Docker socket needed** — the app is already inside the container
- **node-pty** requires native compilation but Bun supports it via `bun install`
- The `bun --bun` flag in `dev` script stays as-is; only `start` changes to `bun server.ts`
- The dev script can optionally be updated to use a similar custom server, or left as-is for now
