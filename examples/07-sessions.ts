/**
 * 07 - Sessions Deep Dive
 * Create session, close it, resume it, then inspect the JSONL file.
 * Uses unstable_v2_createSession + unstable_v2_resumeSession.
 *
 * Run: bun examples/07-sessions.ts
 */
import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
} from "@anthropic-ai/claude-agent-sdk";
import { homedir } from "os";
import type { SDKMessage } from "./types";

function getAssistantText(msg: SDKMessage): string | null {
  if (msg.type !== "assistant") return null;
  return msg.message.content // TODO get types for this
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

// --- Step 1: Create a session ---
console.log("=== Step 1: Create session ===\n");

const session = unstable_v2_createSession({ model: "claude-sonnet-4-6" });

await session.send("Remember this number: 42");

let sessionId: string | undefined;
for await (const msg of session.stream()) {
  sessionId = msg.session_id;
  const text = getAssistantText(msg);
  if (text) console.log(`[assistant] ${text}`);
  if (msg.type === "result" && msg.subtype === "success") {
    console.log(`[result] Cost: $${msg.total_cost_usd.toFixed(4)}`);
  }
}

console.log(`\nSession ID: ${sessionId}`);
session.close();

// --- Step 2: Resume the session ---
console.log("\n=== Step 2: Resume session ===\n");

await using resumed = unstable_v2_resumeSession(sessionId!, {
  model: "claude-sonnet-4-6",
});

await resumed.send("What number did I ask you to remember?");

for await (const msgs of resumed.stream()) {
  const msg = msgs as SDKMessage;
  switch (msg.type) {
    case "assistant":
      for (const block of msg.message.content) {
        if (block.type === "text") {
          console.log(block.text);
        }
      }
      break;
    case "result":
      if (msg.subtype === "success") {
        console.log(`[result] Cost: $${msg.total_cost_usd.toFixed(4)}`);
      }
      break;
  }
}
console.log("\n=== Step 3: Session file ===\n");

const cwd = process.cwd();
const slug = cwd.replace(/\//g, "-");
const sessionFile = `${homedir()}/.claude/projects/${slug}/${sessionId}.jsonl`;
console.log(`Path: ${sessionFile}`);

const file = Bun.file(sessionFile);
if (await file.exists()) {
  const content = await file.text();
  const lines = content.trim().split("\n");
  console.log(`Lines: ${lines.length}\n`);

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
  console.log("Session file not found");
}

// --- Step 4: CLI interop ---
console.log("\n=== Step 4: CLI Interop ===\n");
console.log(`Resume in CLI: claude --resume ${sessionId}`);
