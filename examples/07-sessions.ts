/**
 * 07 - Sessions Deep Dive
 * Create session, resume it, inspect JSONL file, show CLI interop.
 * Uses unstable_v2_createSession + unstable_v2_resumeSession.
 *
 * Run: bun examples/07-sessions.ts
 */
import { unstable_v2_createSession, unstable_v2_resumeSession } from "@anthropic-ai/claude-agent-sdk";
import { homedir } from "os";

const sessionOpts = { model: "claude-sonnet-4-6" } as const;

let sessionId: string;
let sessionCwd: string | undefined;

// --- Step 1: Create a session ---
console.log("=== Step 1: Creating a new V2 session ===\n");
{
  await using session = unstable_v2_createSession(sessionOpts);

  await session.send("Remember this: the secret code is ALPHA-7742. Confirm you've noted it.");

  for await (const message of session.stream()) {
    if (message.type === "system" && message.subtype === "init") {
      sessionCwd = message.cwd;
      console.log(`[init] Session ID: ${session.sessionId}`);
      console.log(`[init] CWD: ${sessionCwd}`);
    } else if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") console.log(`[assistant] ${block.text}`);
      }
    } else if (message.type === "result" && message.subtype === "success") {
      console.log(`[result] Cost: $${message.total_cost_usd.toFixed(4)}`);
    }
  }

  sessionId = session.sessionId;
}

// --- Step 2: Resume the session ---
console.log("\n=== Step 2: Resuming via unstable_v2_resumeSession ===\n");
{
  await using session = unstable_v2_resumeSession(sessionId, sessionOpts);

  await session.send("What was the secret code I told you earlier?");

  for await (const message of session.stream()) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") console.log(`[assistant] ${block.text}`);
      }
    } else if (message.type === "result" && message.subtype === "success") {
      console.log(`[result] Cost: $${message.total_cost_usd.toFixed(4)}`);
    }
  }
}

// --- Step 3: Inspect session file ---
console.log("\n=== Step 3: Session file inspection ===\n");

const cwd = sessionCwd ?? process.cwd();
const slug = cwd.replace(/\//g, "-");
const sessionFile = `${homedir()}/.claude/projects/${slug}/${sessionId}.jsonl`;
console.log(`Session file: ${sessionFile}`);

const file = Bun.file(sessionFile);
if (await file.exists()) {
  const content = await file.text();
  const lines = content.trim().split("\n");
  console.log(`Total lines (messages): ${lines.length}\n`);

  console.log("Message types:");
  const typeCounts: Record<string, number> = {};
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      const key = obj.type === "system" ? `system:${obj.subtype}` : obj.type;
      typeCounts[key] = (typeCounts[key] ?? 0) + 1;
    } catch {}
  }
  for (const [type, count] of Object.entries(typeCounts)) {
    console.log(`  ${type}: ${count}`);
  }
} else {
  console.log("Session file not found (session persistence may be disabled)");
}

// --- Step 4: CLI interop instructions ---
console.log("\n=== Step 4: CLI Interop ===\n");
console.log("You can resume this exact session in the Claude Code CLI:");
console.log(`  claude --resume ${sessionId}`);
console.log("\nOr continue the most recent session:");
console.log("  claude --continue");
console.log("\nBrowse all sessions interactively:");
console.log("  claude --resume");
