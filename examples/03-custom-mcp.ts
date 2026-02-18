/**
 * 03 - Custom MCP Tool
 * Session picks up the weather MCP server from .mcp.json (stdio transport).
 * No in-process wiring needed — the Claude Code subprocess loads .mcp.json automatically.
 *
 * Prerequisites:
 *   - .mcp.json has "weather" server pointing to tools/weather-server.ts
 *   - bun install @modelcontextprotocol/sdk
 *
 * Run: bun examples/03-custom-mcp.ts
 */
import { unstable_v2_createSession } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage } from "./types";

const PROMPT = `What's the weather in San Francisco and Tokyo? Convert both temperatures to Fahrenheit.`;
console.log("Starting V2 session with custom MCP tools from .mcp.json...\n");

await using session = unstable_v2_createSession({
  model: "claude-sonnet-4-6",
  executable: 'bun',
  permissionMode: 'bypassPermissions',
  executableArgs: ['--mcp-config ./.mcp.json']

});

await session.send(
  PROMPT
);

for await (const message of session.stream()) {
  const msg = message as SDKMessage;
  switch (msg.type) {
    case "system":
      if (msg.subtype === "init") {
        console.log(msg)
        console.log(`[init] agents: ${msg.agents?.join(", ") ?? "none"}`);
        console.log(`[init] MCP servers: ${msg.mcp_servers.join(", ")}`);
        console.log(`[init] tools: ${message.tools.join(", ")}\n`);
      }
      break;

    case "assistant":
      for (const block of message.message.content) {
        if (block.type === "text") {
          console.log(block.text);
        } else if (block.type === "tool_use") {
          console.log(
            `\n[tool_use] ${block.name}(${JSON.stringify(block.input)})`
          );
        }
      }
      break;

    case "result":
      console.log("\n--- Done ---");
      if (message.subtype === "success") {
        console.log(
          `Cost: $${message.total_cost_usd.toFixed(4)} | Turns: ${message.num_turns}`
        );
      }
      break;
  }
}


console.log(session.sessionId);