/**
 * 09 - V1 query() API with programmatic MCP
 * Uses the V1 query() API which supports mcpServers directly in options.
 * V2 createSession() doesn't support mcpServers — query() is the way to go for programmatic MCP.
 *
 * Run: bun examples/09-query-mcp.ts
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage } from "./types";

const PROMPT2 = `What's the weather in San Francisco and Tokyo? Convert both temperatures to Fahrenheit. List the Linear issues for the project appmisha.com. List the Railway projects for the user grmkris.`;
const PROMPT = `How does linear and railway auth work?`;
console.log("Starting V1 query() with programmatic MCP server...\n");

const conversation = query({
  prompt: PROMPT,
  options: {
    model: "claude-sonnet-4-6",
    executable: "bun",
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    cwd: "/Users/kristjangrm/code/appmisha/appmisha-agent",
    agents: {},
    mcpServers: {
      weather: {
        type: "stdio",
        command: "bun",
        args: ["tools/weather-server.ts"],
      },
      "railway-mcp-server": {
        type: "stdio",
        command: "bunx",
        args: ["@railway/mcp-server"],
        env: {},
      },
    "Linear": {
        type: "stdio",
        command: "bunx",
        args: ["mcp-remote", "https://mcp.linear.app/sse"],
        env: {},
      },
    },
  },
});

let sessionId: string | null = null;
for await (const message of conversation) {
  const msg = message as SDKMessage;

  switch (msg.type) {
    case "system":
      if (msg.subtype === "init") {
        sessionId = msg.session_id;
        const servers = msg.mcp_servers ?? [];
        console.log(
          `[init] MCP servers: ${servers.map((s) => `${s.name} (${s.status})`).join(", ") || "none"}`
        );
        console.log(`[init] tools: ${msg.tools?.join(", ") ?? "none"}\n`);
      }
      break;

    case "assistant":
      for (const block of msg.message.content) {
        if (block.type === "text") {
          console.log(block.text);
        } else if (block.type === "tool_use") {
          console.log(`\n[tool_use] ${block.name}(${JSON.stringify(block.input)})`);
        }
      }
      break;

    case "result":
      console.log("\n--- Done ---");
      if (msg.subtype === "success") {
        console.log(
          `Cost: $${msg.total_cost_usd.toFixed(4)} | Turns: ${msg.num_turns}`
        );
      }
      break;
  }
}
if (sessionId !== null) {
  console.log(`\nSession ID: ${sessionId}`);
}