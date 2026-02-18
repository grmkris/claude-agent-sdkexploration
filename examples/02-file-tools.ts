/**
 * 02 - Built-in File Tools
 * Session-based agent using Read, Glob, Grep to explore the project.
 *
 * Run: bun examples/02-file-tools.ts
 */
import { unstable_v2_createSession } from "@anthropic-ai/claude-agent-sdk";

await using session = unstable_v2_createSession({
  model: "claude-sonnet-4-6",
  allowedTools: ["Read", "Glob", "Grep"],
});

await session.send("List all files in this project and briefly describe what each one does. Be concise.");

for await (const message of session.stream()) {
  switch (message.type) {
    case "system":
      if (message.subtype === "init") {
        console.log(`[init] session=${message.session_id}`);
        console.log(`[init] tools: ${message.tools.join(", ")}\n`);
      }
      break;

    case "assistant":
      for (const block of message.message.content) {
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
