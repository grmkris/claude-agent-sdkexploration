import { query } from "@anthropic-ai/claude-agent-sdk";
import { CronExpressionParser } from "cron-parser";

import type { CronJob } from "./types";

// Strip CLAUDECODE to allow the Agent SDK to spawn inside a Claude Code container
const { CLAUDECODE: _CC, ...cleanEnv } = process.env;

import { resolveSlugToPath } from "./claude-fs";
// Note: the claude-explorer MCP server is configured at the user level in
// ~/.claude.json (http://localhost:PORT), so cron-spawned Claude sessions
// automatically have access to email_send and other explorer tools without
// needing to pass mcpServers here (which would conflict/override the user config).
import {
  getCrons,
  updateCronStatus,
  addCronEvent,
  updateCronEventStatus,
} from "./explorer-store";

let intervalId: ReturnType<typeof setInterval> | null = null;

async function resolveProjectPath(cron: CronJob): Promise<string> {
  return cron.projectPath ?? (await resolveSlugToPath(cron.projectSlug));
}

export function shouldFire(cron: CronJob, now: Date): boolean {
  try {
    const expr = CronExpressionParser.parse(cron.expression, {
      currentDate: now,
    });
    const prev = expr.prev().toDate();
    // If previous scheduled time is within 60s of now, fire
    return now.getTime() - prev.getTime() < 60_000;
  } catch {
    return false;
  }
}

export async function executeCron(cron: CronJob): Promise<void> {
  const now = new Date().toISOString();
  const eventId = crypto.randomUUID();
  await updateCronStatus(cron.id, "running", now);
  await addCronEvent({
    id: eventId,
    cronId: cron.id,
    timestamp: now,
    status: "running",
    expression: cron.expression,
    prompt: cron.prompt,
  });

  try {
    const cwd = await resolveProjectPath(cron);
    console.log(`[cron ${cron.id}] Executing: "${cron.prompt}" in ${cwd}`);

    const conversation = query({
      prompt: cron.prompt,
      options: {
        model: "claude-sonnet-4-6",
        executable: "bun",
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        env: cleanEnv,
        cwd,
        ...(cron.sessionId ? { resume: cron.sessionId } : {}),
      },
    });

    // Drain the iterator, capture session ID from first message that has it
    let capturedSessionId: string | undefined;
    for await (const msg of conversation) {
      if (
        !capturedSessionId &&
        msg &&
        typeof msg === "object" &&
        "session_id" in msg
      ) {
        capturedSessionId = (msg as { session_id: string }).session_id;
      }
    }

    console.log(
      `[cron ${cron.id}] Completed successfully (session: ${capturedSessionId ?? "unknown"})`
    );
    await updateCronStatus(cron.id, "success", now);
    await updateCronEventStatus(eventId, "success", capturedSessionId);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[cron ${cron.id}] Failed: ${errMsg}`);
    await updateCronStatus(cron.id, "error", now);
    await updateCronEventStatus(eventId, "error");
  }
}

const STUCK_TIMEOUT = 5 * 60_000; // 5 min

async function tick(): Promise<void> {
  const now = new Date();
  const crons = await getCrons();
  const enabled = crons.filter((c) => c.enabled);
  console.log(
    `[tick] ${now.toISOString()} — ${enabled.length}/${crons.length} crons enabled`
  );

  for (const cron of crons) {
    if (!cron.enabled) continue;

    // Watchdog: reset crons stuck in "running" for >5 min
    if (cron.lastRunStatus === "running" && cron.lastRun) {
      const elapsed = now.getTime() - new Date(cron.lastRun).getTime();
      if (elapsed > STUCK_TIMEOUT) {
        console.error(
          `[cron ${cron.id}] Stuck for ${Math.round(elapsed / 1000)}s, resetting to error`
        );
        await updateCronStatus(cron.id, "error", cron.lastRun);
        continue;
      }
      continue;
    }

    const fires = shouldFire(cron, now);
    console.log(
      `[tick] cron ${cron.id.slice(0, 8)} (${cron.expression}) — shouldFire=${fires}, lastStatus=${cron.lastRunStatus ?? "none"}`
    );
    if (fires) {
      executeCron(cron).catch((err) => {
        console.error(`[cron ${cron.id}] Unhandled error:`, err);
      });
    }
  }
}

export function startScheduler(): void {
  if (intervalId) return;
  console.log("[cron-scheduler] Started (60s interval)");
  intervalId = setInterval(tick, 60_000);
  tick().catch((err) => {
    console.error("[cron-scheduler] Initial tick failed:", err);
  });
}

export function stopScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
