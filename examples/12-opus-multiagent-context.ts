/**
 * 12 - Opus Multi-Agent Context Tracking
 *
 * Demonstrates:
 *   1. A main claude-opus-4-6 session orchestrating two Opus sub-agents
 *   2. Real-time context window display after every turn (tokens used / max, %)
 *   3. PreCompact hook — fires just before the SDK compacts the context
 *   4. compact_boundary system message — fires after compaction with pre-compaction token count
 *   5. Skills integration — lists available skills reported at session init
 *
 * Prerequisites:
 *   - .claude/agents/opus-researcher.md  (tools: Read, Glob, Grep, model: opus)
 *   - .claude/agents/opus-analyst.md     (model: opus)
 *
 * Run: bun examples/12-opus-multiagent-context.ts
 */

import {
  unstable_v2_createSession,
  type HookCallback,
  type PreCompactHookInput,
  type ModelUsage,
} from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage } from "./types";

// ─── Context Window Display ───────────────────────────────────────────────────

function formatBar(used: number, max: number, width = 36): string {
  if (max === 0) return "[ no data ]";
  const pct = Math.min(used / max, 1);
  const filled = Math.round(pct * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  const pctStr = (pct * 100).toFixed(1).padStart(5);
  return `[${bar}] ${pctStr}%`;
}

function printContextUsage(modelUsage: Record<string, ModelUsage>): void {
  const divider = "─".repeat(62);
  console.log(`\n┌${divider}┐`);
  console.log(`│  Context Window Usage                                        │`);
  console.log(`├${divider}┤`);

  for (const [model, usage] of Object.entries(modelUsage)) {
    // Shorten e.g. "claude-opus-4-6" → "opus-4-6"
    const shortModel = model.replace("claude-", "").padEnd(16);
    const bar = formatBar(usage.contextWindow, usage.maxOutputTokens);
    const ctx = `${usage.contextWindow.toLocaleString()} / ${usage.maxOutputTokens.toLocaleString()} tokens`;
    console.log(`│  ${shortModel}  ${bar} │`);
    console.log(`│  ${" ".repeat(16)}  ctx: ${ctx.padEnd(38)} │`);
    console.log(`│  ${" ".repeat(16)}  in: ${String(usage.inputTokens).padStart(7)}  out: ${String(usage.outputTokens).padStart(7)}  cached: ${String(usage.cacheReadInputTokens).padStart(7)}  cost: $${usage.costUSD.toFixed(4).padStart(7)} │`);
  }

  console.log(`└${divider}┘\n`);
}

// ─── PreCompact Hook ──────────────────────────────────────────────────────────

let compactionCount = 0;

const preCompactHook: HookCallback = async (input) => {
  if (input.hook_event_name !== "PreCompact") return {};
  const compact = input as PreCompactHookInput;
  compactionCount++;
  console.log("\n╔══════════════════════════════════════╗");
  console.log(`║  ⚡ PreCompact hook fired (#${compactionCount})        ║`);
  console.log(`║  trigger: ${compact.trigger.padEnd(27)}║`);
  if (compact.custom_instructions) {
    console.log(`║  instructions: ${compact.custom_instructions.slice(0, 22).padEnd(22)} ║`);
  }
  console.log("╚══════════════════════════════════════╝");
  return {};
};

// ─── Session ──────────────────────────────────────────────────────────────────

console.log("Starting Opus multi-agent session with context tracking...\n");

await using session = unstable_v2_createSession({
  model: "claude-opus-4-6",
  allowedTools: ["Task"],
  hooks: {
    PreCompact: [{ hooks: [preCompactHook] }],
  },
});

// ─── Stream Handler ───────────────────────────────────────────────────────────

async function runTurn(turnLabel: string, prompt: string): Promise<void> {
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  ${turnLabel}`);
  console.log(`${"═".repeat(64)}\n`);

  await session.send(prompt);

  for await (const message of session.stream()) {
    const msg = message as SDKMessage;

    switch (msg.type) {
      case "system":
        if (msg.subtype === "init") {
          console.log(`[init] model:         ${msg.model}`);
          console.log(`[init] claude version: ${msg.claude_code_version}`);
          console.log(`[init] agents:         ${msg.agents?.join(", ") ?? "(none)"}`);

          // Skills integration: list all available skills at startup
          if (msg.skills && msg.skills.length > 0) {
            console.log(`[init] skills:         ${msg.skills.join(", ")}`);
          } else {
            console.log(`[init] skills:         (none installed)`);
          }
          console.log();

        } else if (msg.subtype === "task_started") {
          console.log(`\n  ▶ Task started: "${msg.description}"`);
          console.log(`    task_id: ${msg.task_id}`);

        } else if (msg.subtype === "task_notification") {
          const statusIcon = msg.status === "completed" ? "✓" : msg.status === "failed" ? "✗" : "■";
          console.log(`\n  ${statusIcon} Task ${msg.status}: ${msg.summary.slice(0, 180)}${msg.summary.length > 180 ? "…" : ""}`);
          if (msg.usage) {
            console.log(`    tokens: ${msg.usage.total_tokens.toLocaleString()}  tools: ${msg.usage.tool_uses}  time: ${(msg.usage.duration_ms / 1000).toFixed(1)}s`);
          }

        } else if (msg.subtype === "status" && msg.status === "compacting") {
          console.log("\n  ⏳ Context compacting...");

        } else if (msg.subtype === "compact_boundary") {
          console.log("\n╔══════════════════════════════════════╗");
          console.log(`║  ✅ Compaction complete                ║`);
          console.log(`║  trigger:    ${msg.compact_metadata.trigger.padEnd(24)}║`);
          console.log(`║  pre-tokens: ${String(msg.compact_metadata.pre_tokens.toLocaleString()).padEnd(24)}║`);
          console.log("╚══════════════════════════════════════╝");
        }
        break;

      case "assistant":
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text.trim()) {
            // Print assistant text with a leading indent
            const lines = block.text.trimEnd().split("\n");
            for (const line of lines) {
              console.log(`  ${line}`);
            }
          } else if (block.type === "tool_use") {
            const inputPreview = JSON.stringify(block.input).slice(0, 100);
            console.log(`\n  [tool] ${block.name}(${inputPreview}${inputPreview.length >= 100 ? "…" : ""})`);
          }
        }
        break;

      case "result":
        console.log(`\n  ── Turn complete ──`);
        if (msg.subtype === "success") {
          console.log(`  turns: ${msg.num_turns}  total cost: $${msg.total_cost_usd.toFixed(4)}`);
          if (msg.modelUsage && Object.keys(msg.modelUsage).length > 0) {
            printContextUsage(msg.modelUsage);
          }
        } else {
          console.log(`  ⚠ Result error: ${msg.subtype}`);
          if (msg.errors?.length) {
            for (const err of msg.errors) console.log(`    ${err}`);
          }
        }
        return; // exit stream after result
    }
  }
}

// ─── Turn 1: Dispatch both Opus sub-agents ────────────────────────────────────

await runTurn(
  "Turn 1 — Research + Analysis",
  `You have two subagents available: "opus-researcher" and "opus-analyst".

First, use "opus-researcher" to thoroughly explore this project. The researcher should:
- Read every TypeScript file in the examples/ directory (all 12 files)
- Read every agent definition file in .claude/agents/
- Read the package.json at the project root
- Return full file contents with paths

Then pass ALL of the researcher's findings to "opus-analyst" for a comprehensive architectural analysis.
The analyst should produce at least 600 words covering design patterns, module relationships, strengths, and recommendations.

Use both agents. Be thorough.`
);

// ─── Turn 2: Deeper SDK investigation ────────────────────────────────────────

await runTurn(
  "Turn 2 — SDK Deep Dive",
  `Use "opus-researcher" again to specifically investigate the SDK type definitions.
The researcher should read the following files completely:
- node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts  (the full type declaration file)

Then use "opus-analyst" to analyze the SDK's type system: what types are exported, how the
session API differs from the query API, what hook types are available, and how ModelUsage
tracks context window data. The analyst should provide a thorough comparison with code examples.`
);

// ─── Turn 3: nextapp architecture (designed to build context pressure) ────────

await runTurn(
  "Turn 3 — Next.js App Architecture",
  `Use "opus-researcher" to explore the nextapp/claude-explorer directory structure.
The researcher should read:
- nextapp/claude-explorer/package.json
- All files in nextapp/claude-explorer/lib/
- All files in nextapp/claude-explorer/app/
- All files in nextapp/claude-explorer/hooks/
- All files in nextapp/claude-explorer/components/ (up to 10 files)

Then use "opus-analyst" to produce a detailed explanation of how the Next.js app integrates
with the Claude Agent SDK — covering the data flow, state management, session persistence,
MCP tool exposure, and the explorer UI architecture. Include full code examples.
This analysis should be comprehensive and at least 800 words.`
);

console.log("\nAll turns complete.");
if (compactionCount > 0) {
  console.log(`Context was compacted ${compactionCount} time(s) during this session.`);
} else {
  console.log("Context was not compacted during this session (context stayed within threshold).");
}
