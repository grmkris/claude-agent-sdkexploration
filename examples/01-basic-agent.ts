/**
 * 01 - Basic Agent
 * One-shot prompt using unstable_v2_prompt — simplest possible usage.
 *
 * Run: bun examples/01-basic-agent.ts
 */
import { unstable_v2_prompt } from "@anthropic-ai/claude-agent-sdk";

console.log("Sending one-shot prompt via V2 API...\n");

const result = await unstable_v2_prompt(
  "Which MCPs and tools are available and skills are available?",
  { model: "claude-sonnet-4-6",  }
);

console.log(result);

if (result.subtype === "success") {
  console.log(`Result: ${result.result}`);
  console.log(`\nCost: $${result.total_cost_usd.toFixed(4)}`);
  console.log(`Turns: ${result.num_turns}`);
  console.log(`Tokens: ${result.usage.input_tokens} in / ${result.usage.output_tokens} out`);
  console.log(`Session: ${result.session_id}`);
} else {
  console.error("Error:", result.subtype);
}
