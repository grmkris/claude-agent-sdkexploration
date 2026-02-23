/**
 * Standalone cron worker process.
 * Run alongside the Next.js dev server: `bun cron-worker.ts`
 *
 * Reads crons from ~/.claude/explorer.json every 60s and executes them.
 * Completely independent of Next.js — no hot-reload issues.
 */
import { startScheduler } from "./lib/cron-scheduler";

startScheduler();

// Keep process alive
process.on("SIGINT", () => {
  console.log("\n[cron-worker] Shutting down");
  process.exit(0);
});
