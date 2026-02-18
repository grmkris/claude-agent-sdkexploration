/**
 * 05 - Structured Output
 * Prompt engineering + Zod validation for typed JSON responses.
 *
 * Run: bun examples/05-structured-output.ts
 */
import { unstable_v2_createSession } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";

const ProjectAnalysis = z.object({
  name: z.string().describe("Project name"),
  description: z.string().describe("One-line description"),
  language: z.string().describe("Primary programming language"),
  dependencies: z
    .array(
      z.object({
        name: z.string(),
        purpose: z.string(),
      })
    )
    .describe("Key dependencies and what they're used for"),
  fileCount: z.number().describe("Number of source files"),
  suggestions: z.array(z.string()).describe("2-3 improvement suggestions"),
});

type ProjectAnalysis = z.infer<typeof ProjectAnalysis>;

const jsonSchema = JSON.stringify(z.toJSONSchema(ProjectAnalysis), null, 2);

console.log("Analyzing project with V2 session + Zod-validated structured output...\n");

await using session = unstable_v2_createSession({
  model: "claude-sonnet-4-6",
  allowedTools: ["Read", "Glob"],
});

await session.send(
  `Analyze this project and return structured data about it.

IMPORTANT: Your final response must be ONLY valid JSON matching this schema — no markdown, no code fences, no explanation before or after:

${jsonSchema}`
);

let resultText = "";

for await (const message of session.stream()) {
  switch (message.type) {
    case "assistant":
      for (const block of message.message.content) {
        if (block.type === "tool_use") {
          console.log(`[tool] ${block.name}`);
        }
      }
      break;

    case "result":
      console.log("\n--- Result ---");
      if (message.subtype === "success") {
        resultText = message.result;

        // Strip markdown code fences if the model wraps in ```json ... ```
        const cleaned = resultText
          .replace(/^```json\s*/i, "")
          .replace(/```\s*$/, "")
          .trim();

        const parseResult = ProjectAnalysis.safeParse(JSON.parse(cleaned));

        if (parseResult.success) {
          const parsed = parseResult.data;
          console.log(`\nProject: ${parsed.name}`);
          console.log(`Description: ${parsed.description}`);
          console.log(`Language: ${parsed.language}`);
          console.log(`Files: ${parsed.fileCount}`);
          console.log(`\nDependencies:`);
          for (const dep of parsed.dependencies) {
            console.log(`  - ${dep.name}: ${dep.purpose}`);
          }
          console.log(`\nSuggestions:`);
          for (const s of parsed.suggestions) {
            console.log(`  - ${s}`);
          }
        } else {
          console.log("Zod validation failed:");
          console.log(parseResult.error.issues);
          console.log(`\nRaw result: ${resultText.slice(0, 500)}`);
        }

        console.log(`\nCost: $${message.total_cost_usd.toFixed(4)}`);
      } else {
        console.log("No result received");
      }
      break;
  }
}
