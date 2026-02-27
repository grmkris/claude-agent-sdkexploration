/**
 * lib/terminal-ws-server.ts
 *
 * WebSocket → PTY bridge library.
 *
 * Uses Bun FFI to call openpty(3) from libutil, then spawns /bin/bash
 * with the slave fd as stdin/stdout/stderr. The master fd is read/written
 * by the WebSocket handler. This avoids the need for node-pty (which
 * requires native compilation with Python/node-gyp).
 *
 * Protocol (client ↔ server):
 *   Client → Server:  raw string input  OR  JSON { type:"resize", cols, rows }
 *   Server → Client:  raw terminal output (string)
 */

import type { IncomingMessage } from "node:http";
import type { WebSocketServer, WebSocket } from "ws";

import { dlopen, FFIType, ptr } from "bun:ffi";

// ── FFI: openpty + ioctl + close + read + write ──────────────────────────────

const libutil = dlopen("libutil.so.1", {
  openpty: {
    args: [
      FFIType.ptr, // int *amaster
      FFIType.ptr, // int *aslave
      FFIType.ptr, // char *name        (null → don't care)
      FFIType.ptr, // struct termios *  (null → default)
      FFIType.ptr, // struct winsize *  (null → default)
    ],
    returns: FFIType.int,
  },
});

const libc = dlopen("libc.so.6", {
  ioctl: {
    args: [FFIType.int, FFIType.u64, FFIType.ptr],
    returns: FFIType.int,
  },
  close: {
    args: [FFIType.int],
    returns: FFIType.int,
  },
  read: {
    args: [FFIType.int, FFIType.ptr, FFIType.u64],
    returns: FFIType.i64,
  },
  write: {
    args: [FFIType.int, FFIType.ptr, FFIType.u64],
    returns: FFIType.i64,
  },
});

// TIOCSWINSZ ioctl number on Linux x86-64
const TIOCSWINSZ = 0x5414n;

/** Resize the PTY to cols × rows via TIOCSWINSZ ioctl on the master fd. */
function resizePty(masterFd: number, cols: number, rows: number) {
  // struct winsize layout: ws_row(u16), ws_col(u16), ws_xpixel(u16), ws_ypixel(u16)
  const winsize = new Uint16Array(4);
  winsize[0] = rows;
  winsize[1] = cols;
  winsize[2] = 0;
  winsize[3] = 0;
  libc.symbols.ioctl(masterFd, TIOCSWINSZ, ptr(winsize));
}

// ── Per-connection session ────────────────────────────────────────────────────

interface PtySession {
  masterFd: number;
  proc: ReturnType<typeof Bun.spawn>;
}

const sessions = new WeakMap<WebSocket, PtySession>();

function spawnPtyShell(
  ws: WebSocket,
  cwd: string,
  cols: number,
  rows: number
): PtySession | null {
  const masterBuf = new Int32Array(1);
  const slaveBuf = new Int32Array(1);

  const rc = libutil.symbols.openpty(
    ptr(masterBuf),
    ptr(slaveBuf),
    null,
    null,
    null
  );

  if (rc !== 0) {
    ws.send("\r\n\x1b[31m[error: openpty failed]\x1b[0m\r\n");
    ws.close();
    return null;
  }

  const masterFd = masterBuf[0];
  const slaveFd = slaveBuf[0];

  // Set initial size
  resizePty(masterFd, cols, rows);

  // Spawn bash with the slave fd as its terminal
  const proc = Bun.spawn(["/bin/bash", "-i"], {
    stdin: slaveFd as unknown as "pipe",
    stdout: slaveFd as unknown as "pipe",
    stderr: slaveFd as unknown as "pipe",
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    },
  });

  // Close the slave fd in this (parent) process — bash owns it now
  libc.symbols.close(slaveFd);

  // Async read loop: PTY master → WebSocket
  const readBuf = new Uint8Array(4096);
  void (async () => {
    try {
      while (true) {
        const n = libc.symbols.read(masterFd, ptr(readBuf), readBuf.byteLength);
        if (Number(n) <= 0) break;
        if (ws.readyState === 1 /* OPEN */) {
          ws.send(Buffer.from(readBuf.buffer, 0, Number(n)).toString());
        }
      }
    } catch {
      // PTY master closed (shell exited)
    } finally {
      libc.symbols.close(masterFd);
      if (ws.readyState === 1 /* OPEN */) {
        ws.send("\r\n\x1b[90m[session ended]\x1b[0m\r\n");
        ws.close();
      }
    }
  })();

  return { masterFd, proc };
}

// ── WebSocket handler ─────────────────────────────────────────────────────────

export function setupTerminalWs(wss: WebSocketServer) {
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const cwd = url.searchParams.get("cwd") ?? process.env.HOME ?? "/home/bun";
    const cols = Number(url.searchParams.get("cols") ?? 80);
    const rows = Number(url.searchParams.get("rows") ?? 24);

    const session = spawnPtyShell(ws, cwd, cols, rows);
    if (!session) return;
    sessions.set(ws, session);

    ws.on("message", (raw: Buffer) => {
      const s = sessions.get(ws);
      if (!s) return;
      const str = raw.toString();

      // Try resize control message first
      try {
        const msg = JSON.parse(str) as {
          type: string;
          cols?: number;
          rows?: number;
        };
        if (msg.type === "resize" && msg.cols && msg.rows) {
          resizePty(s.masterFd, msg.cols, msg.rows);
          return;
        }
      } catch {
        // Not JSON — fall through to write as raw input
      }

      // Write raw input to the PTY master
      const encoded = Buffer.from(str);
      libc.symbols.write(
        s.masterFd,
        ptr(
          new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength)
        ),
        encoded.byteLength
      );
    });

    ws.on("close", () => {
      const s = sessions.get(ws);
      if (s) {
        try {
          s.proc.kill();
        } catch {}
        libc.symbols.close(s.masterFd);
        sessions.delete(ws);
      }
    });
  });
}
