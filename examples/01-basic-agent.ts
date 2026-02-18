/**
 * 01 - Basic Agent
 * One-shot prompt using unstable_v2_prompt — simplest possible usage.
 *
 * Run: bun examples/01-basic-agent.ts
 */
import { unstable_v2_createSession, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
const PROMPT = "Which MCPs and tools are available and skills are available?";
console.log(`Sending one-shot prompt via V2 API...\n${PROMPT}\n`);

await using session = unstable_v2_createSession({
  model: "claude-sonnet-4-6" 
});

await session.send(PROMPT);

for await (const message of session.stream()) {
  const msg = message as SDKMessage;
  switch (msg.type) {
    case "system":
      if (msg.subtype === "init") {
        console.log(msg)
        console.log(`[init] agents: ${msg.agents?.join(", ") ?? "none"}`);
        console.log(`[init] MCP servers: ${msg.mcp_servers.map(s => `${s.name} (${s.status})`).join(", ")}`);
        console.log(`[init] tools: ${message.tools.join(", ")}\n`);
      }
      break;
    case "assistant":
      for (const block of msg.message.content) {
        if (block.type === "text") {
          console.log(block.text);
        } else if (block.type === "tool_use") {
          console.log(`\n[tool_use] ${block.name}(${JSON.stringify(block.input).slice(0, 100)}...)`);
        }
      }
      break;
    case "result":
      console.log("\n--- Done ---");    
      if (message.subtype === "success") {
        console.log(`Cost: $${message.total_cost_usd.toFixed(4)} | Turns: ${message.num_turns}`);
      }
      break;
  }
}