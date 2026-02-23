/**
 * 11 - Real cron execution test (costs API credits)
 *
 * Tests the full cron execution flow:
 * 1. Creates a cron in the store with a real projectPath
 * 2. Calls executeCron() directly
 * 3. Verifies status transitions and session creation
 *
 * Run: bun examples/11-cron-execution.ts
 */
import { addCron, getCrons, removeCron } from "../nextapp/claude-explorer/lib/explorer-store"
import { executeCron } from "../nextapp/claude-explorer/lib/cron-scheduler"

const PROJECT_PATH = process.cwd()
const PROJECT_SLUG = "-" + PROJECT_PATH.replace(/\//g, "-")

console.log("=== Cron Execution Test ===")
console.log(`Project path: ${PROJECT_PATH}`)
console.log(`Project slug: ${PROJECT_SLUG}\n`)

// Create a test cron
const cron = await addCron({
  id: `test-cron-${Date.now()}`,
  expression: "*/5 * * * *",
  prompt: "Say 'Hello from cron test!' and nothing else. Do not use any tools.",
  projectSlug: PROJECT_SLUG,
  projectPath: PROJECT_PATH,
  enabled: true,
  createdAt: new Date().toISOString(),
})

console.log(`Created cron: ${cron.id}`)
console.log(`Executing cron with prompt: "${cron.prompt}"...\n`)

const start = Date.now()

try {
  await executeCron(cron)
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`\nExecution completed in ${elapsed}s`)

  // Check status
  const crons = await getCrons()
  const updated = crons.find((c) => c.id === cron.id)
  console.log(`Status: ${updated?.lastRunStatus}`)
  console.log(`Last run: ${updated?.lastRun}`)
} catch (err) {
  console.error("Execution failed:", err)
} finally {
  // Cleanup
  await removeCron(cron.id)
  console.log(`\nCleaned up test cron: ${cron.id}`)
}
