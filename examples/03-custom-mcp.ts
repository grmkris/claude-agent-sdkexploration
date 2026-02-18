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

console.log("Starting V2 session with custom MCP tools from .mcp.json...\n");

await using session = unstable_v2_createSession({
  model: "claude-sonnet-4-6",
  allowedTools: ["mcp__weather__get_weather", "mcp__weather__convert_temperature"],
});

await session.send(
  "What's the weather in San Francisco and Tokyo? Convert both temperatures to Fahrenheit."
);

for await (const message of session.stream()) {
  switch (message.type) {
    case "system":
      if (message.subtype === "init") {
        const mcpStatus = message.mcp_servers
          .map((s) => `${s.name}(${s.status})`)
          .join(", ");
        console.log(`[init] MCP servers: ${mcpStatus}`);
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
