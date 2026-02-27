"use client";

/**
 * DockerTerminal
 *
 * Full interactive browser terminal backed by a PTY inside the container.
 * Connects to /api/terminal-ws on the same host:port as the page — the
 * proxy server (server/index.ts) intercepts that path and bridges it to
 * a real PTY via Bun FFI openpty.
 */

// xterm CSS must be imported in the client component that uses it
// eslint-disable-next-line import/no-unresolved
import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";

interface DockerTerminalProps {
  /** Working directory for the shell. Defaults to the user's HOME. */
  cwd?: string;
  className?: string;
}

/** WebSocket URL on the same origin — proxied by server/index.ts */
function getWsUrl(cwd?: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host; // hostname + port
  const url = new URL(`${protocol}//${host}/api/terminal-ws`);
  if (cwd) url.searchParams.set("cwd", cwd);
  return url.toString();
}

export function DockerTerminal({ cwd, className }: DockerTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: 13,
      fontFamily:
        "var(--font-geist-mono), 'Cascadia Code', 'Fira Code', Menlo, monospace",
      theme: {
        background: "#09090b", // zinc-950
        foreground: "#e4e4e7", // zinc-200
        cursor: "#a1a1aa", // zinc-400
        selectionBackground: "#3f3f46", // zinc-700
        black: "#18181b",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#facc15",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#e4e4e7",
        brightBlack: "#3f3f46",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fde047",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#f4f4f5",
      },
      allowTransparency: false,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddon.fit();

    const wsUrl = `${getWsUrl(cwd)}&cols=${term.cols}&rows=${term.rows}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })
      );
    };

    ws.onmessage = (e: MessageEvent<string | ArrayBuffer>) => {
      if (e.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(e.data));
      } else {
        term.write(e.data);
      }
    };

    ws.onclose = () => {
      term.write(
        "\r\n\x1b[90m[connection closed — refresh to reconnect]\x1b[0m\r\n"
      );
    };

    ws.onerror = () => {
      term.write(
        "\r\n\x1b[31m[websocket error — could not connect to /api/terminal-ws]\x1b[0m\r\n"
      );
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    const ro = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {}
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      ws.close();
      term.dispose();
    };
  }, [cwd]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
