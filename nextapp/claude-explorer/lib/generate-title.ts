import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const FACETS_DIR = join(
  process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"),
  "usage-data",
  "facets"
);

const TITLE_PROMPT = `You are a session title generator. Respond with ONLY a short title (max 8 words). No quotes, no punctuation at the end, no explanation. Just the title.

Examples:
- "Fix authentication login bug" → Fix Auth Login Bug
- "I want to add dark mode to the settings page" → Add Dark Mode to Settings
- "Can you help me refactor the database queries for better performance" → Refactor Database Queries for Performance
- "Please explore how session naming works in Claude Code" → Explore Claude Code Session Naming

Session prompt:`;

/**
 * Generate a short session title using Haiku and write it as a facet file.
 * This is fire-and-forget — errors are logged but never propagated.
 */
export async function generateSessionTitle(
  sessionId: string,
  firstPrompt: string,
  messageCount: number
): Promise<void> {
  try {
    // Don't regenerate if a facet already exists with a non-empty brief_summary
    // (e.g. from /insights), UNLESS this is the 5th-message refresh
    if (messageCount === 1) {
      try {
        const existing = JSON.parse(
          readFileSync(join(FACETS_DIR, `${sessionId}.json`), "utf-8")
        );
        if (existing.brief_summary && existing.brief_summary.length > 0) {
          console.log(
            `[generate-title] Facet already exists for ${sessionId}, skipping`
          );
          return;
        }
      } catch {
        // No existing facet — proceed
      }
    }

    console.log(
      `[generate-title] Generating title for ${sessionId} (message #${messageCount})`
    );

    // Temporarily unset CLAUDECODE to allow nested SDK call
    const prevClaudeCode = process.env.CLAUDECODE;
    delete process.env.CLAUDECODE;

    let title: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const conversation = query({
        prompt: `${TITLE_PROMPT} ${firstPrompt.slice(0, 300)}`,
        options: {
          model: "claude-haiku-4-5",
          permissionMode: "bypassPermissions",
          maxTurns: 1,
          abortController: controller,
        },
      });

      for await (const msg of conversation) {
        if (msg.type === "assistant" && msg.message?.content) {
          const text = msg.message.content
            .filter((b: { type: string }) => b.type === "text")
            .map((b: { type: string; text?: string }) => b.text ?? "")
            .join("")
            .trim();
          if (text) {
            title = text;
          }
        }
        if (msg.type === "result") break;
      }

      clearTimeout(timeout);
    } finally {
      // Restore CLAUDECODE env
      if (prevClaudeCode !== undefined) {
        process.env.CLAUDECODE = prevClaudeCode;
      } else {
        delete process.env.CLAUDECODE;
      }
    }

    if (!title) {
      console.log(`[generate-title] No title generated for ${sessionId}`);
      return;
    }

    // Clean up the title — remove quotes, trailing punctuation
    title = title
      .replace(/^["']|["']$/g, "")
      .replace(/[.!]$/, "")
      .trim();

    // Ensure facets directory exists
    mkdirSync(FACETS_DIR, { recursive: true });

    // Write facet file — compatible with both readSessionFacets() and Claude Code's IDq validator
    const facet = {
      underlying_goal: firstPrompt.slice(0, 200),
      goal_categories: {},
      outcome: "",
      user_satisfaction_counts: {},
      claude_helpfulness: "",
      session_type: "",
      friction_counts: {},
      friction_detail: "",
      primary_success: "",
      brief_summary: title,
      session_id: sessionId,
    };

    writeFileSync(
      join(FACETS_DIR, `${sessionId}.json`),
      JSON.stringify(facet, null, 2),
      { encoding: "utf-8", mode: 0o600 }
    );

    console.log(`[generate-title] ✓ Title for ${sessionId}: "${title}"`);
  } catch (e) {
    console.error("[generate-title] Failed:", e);
  }
}
