import { RPCHandler } from "@orpc/server/fetch";
import { spawn, type Subprocess } from "bun";
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// --- Setup: temp store + mini oRPC server ---

const tmpFile = join(tmpdir(), `mcp-test-${Date.now()}.json`);
process.env.EXPLORER_STORE_PATH = tmpFile;

const { router } = await import("../lib/procedures");
const rpcHandler = new RPCHandler(router);

let httpServer: ReturnType<typeof Bun.serve>;
let rpcUrl: string;
let mcpProc: Subprocess<"pipe", "pipe", "inherit">;

beforeAll(async () => {
  // Write empty store
  await Bun.write(
    tmpFile,
    JSON.stringify({
      favorites: { projects: [], sessions: [] },
      crons: [],
      messages: [],
      webhooks: [],
      webhookEvents: [],
      cronEvents: [],
    })
  );

  // Start mini oRPC HTTP server
  httpServer = Bun.serve({
    port: 0,
    async fetch(request) {
      const { response } = await rpcHandler.handle(request, { prefix: "/rpc" });
      return response ?? new Response("Not found", { status: 404 });
    },
  });
  rpcUrl = `http://localhost:${httpServer.port}/rpc`;

  // Spawn explorer-server.ts as MCP stdio process
  mcpProc = spawn({
    cmd: ["bun", join(import.meta.dir, "explorer-server.ts")],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
    env: {
      ...process.env,
      EXPLORER_STORE_PATH: tmpFile,
      EXPLORER_RPC_URL: rpcUrl,
    },
  });

  // Wait a moment for process to start
  await Bun.sleep(500);
});

afterAll(() => {
  mcpProc?.kill();
  void httpServer?.stop();
  try {
    unlinkSync(tmpFile);
  } catch {}
});

// --- Helpers ---

let msgId = 0;

async function sendJsonRpc(
  method: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  const id = ++msgId;
  const msg = JSON.stringify({ jsonrpc: "2.0", method, id, params }) + "\n";
  void mcpProc.stdin.write(msg);
  void mcpProc.stdin.flush();

  // Read response from stdout
  const reader = mcpProc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) throw new Error("MCP process ended unexpectedly");
    buffer += decoder.decode(value, { stream: true });

    // Try to parse complete JSON lines
    const lines = buffer.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.id === id) {
          reader.releaseLock();
          return parsed;
        }
      } catch {
        // Not a complete JSON line yet
      }
    }
    // Keep last incomplete line in buffer
    buffer = lines[lines.length - 1];
  }
}

// --- Tests ---

describe("MCP explorer-server over stdio", () => {
  test("initialize handshake", async () => {
    const resp = (await sendJsonRpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0" },
    })) as any;

    expect(resp.result).toBeTruthy();
    expect(resp.result.serverInfo.name).toBe("claude-explorer");

    // Send initialized notification (no response expected, but must be sent)
    void mcpProc.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) +
        "\n"
    );
    void mcpProc.stdin.flush();
    await Bun.sleep(100);
  });

  test("tools/list returns all tools", async () => {
    const resp = (await sendJsonRpc("tools/list")) as any;
    const toolNames = resp.result.tools.map((t: any) => t.name).sort();
    expect(toolNames).toEqual([
      "cron_create",
      "cron_delete",
      "cron_list",
      "cron_toggle",
      "message_list",
      "message_read",
      "message_send",
      "webhook_create",
      "webhook_delete",
      "webhook_events",
      "webhook_list",
      "webhook_toggle",
    ]);
  });

  test("cron_list returns empty", async () => {
    const resp = (await sendJsonRpc("tools/call", {
      name: "cron_list",
      arguments: {},
    })) as any;
    const content = JSON.parse(resp.result.content[0].text);
    expect(content).toEqual([]);
  });

  test("cron_create then cron_list shows it", async () => {
    // Create
    const createResp = (await sendJsonRpc("tools/call", {
      name: "cron_create",
      arguments: {
        expression: "*/10 * * * *",
        prompt: "mcp test cron",
        projectSlug: "mcp-test-project",
      },
    })) as any;
    const created = JSON.parse(createResp.result.content[0].text);
    expect(created.expression).toBe("*/10 * * * *");
    expect(created.id).toBeTruthy();

    // List
    const listResp = (await sendJsonRpc("tools/call", {
      name: "cron_list",
      arguments: {},
    })) as any;
    const crons = JSON.parse(listResp.result.content[0].text);
    expect(crons).toHaveLength(1);
    expect(crons[0].id).toBe(created.id);

    // Toggle
    const toggleResp = (await sendJsonRpc("tools/call", {
      name: "cron_toggle",
      arguments: { id: created.id },
    })) as any;
    const toggled = JSON.parse(toggleResp.result.content[0].text);
    expect(toggled.enabled).toBe(false);

    // Delete
    const deleteResp = (await sendJsonRpc("tools/call", {
      name: "cron_delete",
      arguments: { id: created.id },
    })) as any;
    const deleted = JSON.parse(deleteResp.result.content[0].text);
    expect(deleted.success).toBe(true);

    // Verify empty
    const listResp2 = (await sendJsonRpc("tools/call", {
      name: "cron_list",
      arguments: {},
    })) as any;
    const crons2 = JSON.parse(listResp2.result.content[0].text);
    expect(crons2).toEqual([]);
  });

  test("webhook_list returns empty", async () => {
    const resp = (await sendJsonRpc("tools/call", {
      name: "webhook_list",
      arguments: {},
    })) as any;
    const content = JSON.parse(resp.result.content[0].text);
    expect(content).toEqual([]);
  });

  test("webhook CRUD lifecycle", async () => {
    // Create
    const createResp = (await sendJsonRpc("tools/call", {
      name: "webhook_create",
      arguments: {
        name: "MCP test webhook",
        provider: "generic",
        prompt: "handle payload",
      },
    })) as any;
    const createText = createResp.result.content[0].text;
    expect(createText).toContain("Created webhook. URL:");

    // Extract webhook JSON from after the URL line
    const jsonPart = createText.slice(createText.indexOf("{"));
    const created = JSON.parse(jsonPart);
    expect(created.name).toBe("MCP test webhook");
    expect(created.id).toBeTruthy();

    // List
    const listResp = (await sendJsonRpc("tools/call", {
      name: "webhook_list",
      arguments: {},
    })) as any;
    const webhooks = JSON.parse(listResp.result.content[0].text);
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0].id).toBe(created.id);

    // Toggle
    const toggleResp = (await sendJsonRpc("tools/call", {
      name: "webhook_toggle",
      arguments: { id: created.id },
    })) as any;
    const toggled = JSON.parse(toggleResp.result.content[0].text);
    expect(toggled.enabled).toBe(false);

    // Delete
    const deleteResp = (await sendJsonRpc("tools/call", {
      name: "webhook_delete",
      arguments: { id: created.id },
    })) as any;
    const deleted = JSON.parse(deleteResp.result.content[0].text);
    expect(deleted.success).toBe(true);

    // Verify empty
    const listResp2 = (await sendJsonRpc("tools/call", {
      name: "webhook_list",
      arguments: {},
    })) as any;
    const webhooks2 = JSON.parse(listResp2.result.content[0].text);
    expect(webhooks2).toEqual([]);
  });

  test("webhook_events returns empty", async () => {
    const resp = (await sendJsonRpc("tools/call", {
      name: "webhook_events",
      arguments: {},
    })) as any;
    const content = JSON.parse(resp.result.content[0].text);
    expect(content).toEqual([]);
  });

  test("message_send and message_list", async () => {
    // Send
    const sendResp = (await sendJsonRpc("tools/call", {
      name: "message_send",
      arguments: {
        fromProjectSlug: "proj-a",
        fromSessionId: "s1",
        toProjectSlug: "proj-b",
        body: "hello from MCP test",
      },
    })) as any;
    const msg = JSON.parse(sendResp.result.content[0].text);
    expect(msg.body).toBe("hello from MCP test");
    expect(msg.id).toBeTruthy();

    // List
    const listResp = (await sendJsonRpc("tools/call", {
      name: "message_list",
      arguments: { projectSlug: "proj-b" },
    })) as any;
    const msgs = JSON.parse(listResp.result.content[0].text);
    expect(msgs).toHaveLength(1);

    // Mark read
    const readResp = (await sendJsonRpc("tools/call", {
      name: "message_read",
      arguments: { id: msg.id },
    })) as any;
    const marked = JSON.parse(readResp.result.content[0].text);
    expect(marked.read).toBe(true);
  });
});
