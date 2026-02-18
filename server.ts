/**
 * Bun server with SSE endpoint that triggers Claude Code queries.
 *
 * GET /ask?prompt=...  — streams SDKMessages as SSE
 *
 * Run: bun server.ts
 * Test: curl "http://localhost:3000/ask?prompt=What+is+the+weather+in+Tokyo"
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage } from "./examples/types";

const MCP_SERVERS = {
  weather: {
    type: "stdio" as const,
    command: "bun",
    args: ["tools/weather-server.ts"],
  },
  "railway-mcp-server": {
    type: "stdio" as const,
    command: "npx",
    args: ["-y", "@railway/mcp-server"],
    env: {},
  },
  Linear: {
    type: "stdio" as const,
    command: "npx",
    args: ["-y", "mcp-remote", "https://mcp.linear.app/sse"],
    env: {},
  },
};

Bun.serve({
  port: 3000,
  routes: {
    "/ask": {
      GET: async (req) => {
        const prompt = new URL(req.url).searchParams.get("prompt");
        if (!prompt) {
          return Response.json({ error: "Missing ?prompt= query param" }, { status: 400 });
        }

        const conversation = query({
          prompt,
          options: {
            model: "claude-sonnet-4-6",
            executable: "bun",
            permissionMode: "bypassPermissions",
            allowDangerouslySkipPermissions: true,
            mcpServers: MCP_SERVERS,
          },
        });

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            const send = (event: string, data: unknown) => {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };

            try {
              for await (const message of conversation) {
                const msg = message as SDKMessage;

                switch (msg.type) {
                  case "system":
                    if (msg.subtype === "init") {
                      send("init", {
                        sessionId: msg.session_id,
                        mcpServers: msg.mcp_servers?.map((s) => ({ name: s.name, status: s.status })),
                        tools: msg.tools,
                      });
                    }
                    break;

                  case "assistant":
                    for (const block of msg.message.content) {
                      if (block.type === "text") {
                        send("text", { text: block.text });
                      } else if (block.type === "tool_use") {
                        send("tool_use", { name: block.name, input: block.input });
                      }
                    }
                    break;

                  case "result":
                    send("result", {
                      subtype: msg.subtype,
                      ...(msg.subtype === "success"
                        ? { cost: msg.total_cost_usd, turns: msg.num_turns }
                        : {}),
                    });
                    break;
                }
              }
            } catch (err) {
              send("error", { message: String(err) });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});

console.log("Server running on http://localhost:3000");
console.log("Try: curl http://localhost:3000/ask?prompt=Hello");
