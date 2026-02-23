/**
 * 10 - Explorer MCP integration test (MANUAL — costs API credits)
 *
 * Spawns a real Claude SDK session that calls explorer MCP tools.
 * This is a manual demo, NOT an automated test.
 *
 * Side effects:
 *   - Costs real API credits (Claude Sonnet session)
 *   - Creates/deletes crons in your real ~/.claude/explorer.json
 *   - Creates a session under ~/.claude/projects/
 *
 * Requires: Next.js dev server running on localhost:3000
 *   cd nextapp/claude-explorer && bun dev
 *
 * For automated tests without SDK/cost, see:
 *   - lib/procedures.test.ts (oRPC layer)
 *   - tools/explorer-server.test.ts (MCP stdio layer)
 *
 * Run: bun examples/10-explorer-mcp.ts
 */
import { query } from "@anthropic-ai/claude-agent-sdk"
import type { SDKMessage } from "./types"

const PROMPT = `Use the claude-explorer MCP tools to do the following steps in order:

1. Call cron_list to see current crons
2. Call cron_create with expression "*/5 * * * *", prompt "integration test cron", projectSlug "test-integration-project"
3. Call cron_list again to verify the cron was created
4. Call cron_toggle with the ID of the cron you just created
5. Call cron_list to verify it's now disabled
6. Call cron_delete with the ID of the cron you just created
7. Call cron_list to verify it was deleted

Report the result of each step.`

console.log("Starting Explorer MCP integration test...\n")

const conversation = query({
  prompt: PROMPT,
  options: {
    model: "claude-sonnet-4-6",
    executable: "bun",
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    mcpServers: {
      "claude-explorer": {
        type: "stdio",
        command: "bun",
        args: ["nextapp/claude-explorer/tools/explorer-server.ts"],
      },
    },
  },
})

let sessionId: string | null = null
for await (const message of conversation) {
  const msg = message as SDKMessage

  switch (msg.type) {
    case "system":
      if (msg.subtype === "init") {
        sessionId = msg.session_id
        const servers = msg.mcp_servers ?? []
        console.log(
          `[init] MCP servers: ${servers.map((s) => `${s.name} (${s.status})`).join(", ") || "none"}`
        )
        console.log(`[init] tools: ${msg.tools?.join(", ") ?? "none"}\n`)
      }
      break

    case "assistant":
      for (const block of msg.message.content) {
        if (block.type === "text") {
          console.log(block.text)
        } else if (block.type === "tool_use") {
          console.log(`\n[tool_use] ${block.name}(${JSON.stringify(block.input)})`)
        }
      }
      break

    case "result":
      console.log("\n--- Done ---")
      if (msg.subtype === "success") {
        console.log(
          `Cost: $${msg.total_cost_usd.toFixed(4)} | Turns: ${msg.num_turns}`
        )
      } else {
        console.log(`Result: ${msg.subtype}`)
      }
      break
  }
}

if (sessionId) {
  console.log(`\nSession ID: ${sessionId}`)
}
