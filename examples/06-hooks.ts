/**
 * 06 - Hooks & Guardrails
 * Session-based agent with PreToolUse (block dangerous commands) and PostToolUse (audit logging).
 *
 * Run: bun examples/06-hooks.ts
 */
import {
  unstable_v2_createSession,
  type HookCallback,
  type PreToolUseHookInput,
  type PostToolUseHookInput,
  type SyncHookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";

const BLOCKED_PATTERNS = ["rm -rf", "rm -r /", ":(){ :|:& };:", "mkfs", "dd if="];

// Hook: Block dangerous bash commands
const blockDangerous: HookCallback = async (input, _toolUseID, { signal }) => {
  if (input.hook_event_name !== "PreToolUse") return {};

  const preInput = input as PreToolUseHookInput;
  const command = (preInput.tool_input as { command?: string })?.command ?? "";

  const blocked = BLOCKED_PATTERNS.find((p) => command.includes(p));
  if (blocked) {
    console.log(`\n  [HOOK] BLOCKED dangerous command: "${command}" (matched: ${blocked})`);
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse" as const,
        permissionDecision: "deny" as const,
        permissionDecisionReason: `Blocked dangerous pattern: ${blocked}`,
      },
    } satisfies SyncHookJSONOutput;
  }

  return {};
};

// Hook: Log every tool call
const toolStartTimes = new Map<string, number>();

const auditLog: HookCallback = async (input, toolUseID, { signal }) => {
  if (input.hook_event_name === "PreToolUse") {
    const pre = input as PreToolUseHookInput;
    toolStartTimes.set(pre.tool_use_id, Date.now());
    console.log(`  [AUDIT] Tool start: ${pre.tool_name} | input: ${JSON.stringify(pre.tool_input).slice(0, 80)}`);
  } else if (input.hook_event_name === "PostToolUse") {
    const post = input as PostToolUseHookInput;
    const startTime = toolStartTimes.get(post.tool_use_id);
    const elapsed = startTime ? `${Date.now() - startTime}ms` : "unknown";
    toolStartTimes.delete(post.tool_use_id);
    console.log(`  [AUDIT] Tool done: ${post.tool_name} | elapsed: ${elapsed}`);
  }
  return {};
};

console.log("Starting V2 session with hooks (guardrails + audit logging)...\n");
console.log("The agent will try to run some commands. Dangerous ones will be blocked.\n");

await using session = unstable_v2_createSession({
  model: "claude-sonnet-4-6",
  allowedTools: ["Bash"],
  hooks: {
    PreToolUse: [
      { matcher: "Bash", hooks: [blockDangerous] },
      { hooks: [auditLog] },
    ],
    PostToolUse: [{ hooks: [auditLog] }],
  },
});

await session.send(`Run these bash commands one at a time and report the results:
1. echo "Hello from hook demo"
2. ls -la
3. rm -rf /tmp/test
4. pwd
The rm -rf command should be blocked by the guardrail hook.`);

for await (const message of session.stream()) {
  switch (message.type) {
    case "assistant":
      for (const block of message.message.content) {
        if (block.type === "text") {
          console.log(block.text);
        }
      }
      break;

    case "result":
      console.log("\n--- Done ---");
      if (message.subtype === "success") {
        console.log(`Cost: $${message.total_cost_usd.toFixed(4)} | Turns: ${message.num_turns}`);
      }
      break;
  }
}
