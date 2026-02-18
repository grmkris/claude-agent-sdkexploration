/**
 * 04 - Subagents
 * Session picks up subagent definitions from .claude/agents/*.md files.
 * The "researcher" and "summarizer" agents are defined as markdown files
 * with YAML frontmatter — no inline agent config needed.
 *
 * Prerequisites:
 *   - .claude/agents/researcher.md  (tools: Read, Glob, Grep, model: haiku)
 *   - .claude/agents/summarizer.md  (model: haiku)
 *
 * Run: bun examples/04-subagents.ts
 */
import { unstable_v2_createSession } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage } from "./types";
console.log("Starting V2 session with file-based subagents...\n");

await using session = unstable_v2_createSession({
  model: "claude-sonnet-4-6",
  allowedTools: ["Task"],
});

await session.send(
  `You have two subagents available: "researcher" and "summarizer".
Use the "researcher" to find all TypeScript files in this project and read their contents.
Then use the "summarizer" to create a brief summary of the project.
Use both agents.`
);

for await (const message of session.stream()) {
  const msg = message as SDKMessage;
  switch (msg.type) {
    case "system":
      if (msg.subtype === "init") {
        console.log(`[init] agents: ${msg.agents?.join(", ") ?? "none"}`);
        console.log(`[init] tools: ${msg.tools.join(", ")}\n`);
      } else if (msg.subtype === "task_started") {
        console.log(
          `\n[task_started] ${msg.description} (id: ${msg.task_id})`
        );
      } else if (msg.subtype === "task_notification") {
        console.log(
          `[task_done] ${msg.status}: ${msg.summary.slice(0, 200)}`
        );
      }
      break;

    case "assistant":
      for (const block of message.message.content) {
        if (block.type === "text") {
          console.log(block.text);
        } else if (block.type === "tool_use") {
          console.log(
            `\n[tool_use] ${block.name}(${JSON.stringify(block.input).slice(0, 120)}...)`
          );
        }
      }
      break;

    case "result":
      console.log("\n--- Done ---");
      if (msg.subtype === "success") {
        console.log(
          `Cost: $${msg.total_cost_usd.toFixed(4)} | Turns: ${msg.num_turns}`
        );
        if (msg.modelUsage) {
          console.log("Model usage breakdown:");
          for (const [model, usage] of Object.entries(msg.modelUsage)) {
            console.log(
              `  ${model}: $${usage.costUSD.toFixed(4)} (${usage.inputTokens} in / ${usage.outputTokens} out)`
            );
          }
        }
      }
      break;
  }
}
