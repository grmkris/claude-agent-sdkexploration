import { $ } from "bun";

import type { TmuxPane } from "./types";

// Match the same encoding Claude CLI uses for project directories
// by reading actual dir names from ~/.claude/projects/
import { resolveSlugForCwd } from "./claude-fs";
import { getTmuxSessions, removeTmuxSession } from "./explorer-store";

export async function getTmuxPanes(): Promise<TmuxPane[]> {
  try {
    const output =
      await $`tmux list-panes -a -F "#{session_name}:#{window_index}.#{pane_index} #{pane_pid} #{pane_current_path}"`
        .quiet()
        .text();

    const rawPanes: {
      session: string;
      window: number;
      pane: number;
      pid: number;
      cwd: string;
    }[] = [];
    for (const line of output.trim().split("\n")) {
      if (!line.trim()) continue;
      const match = line.match(/^(.+?):(\d+)\.(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) continue;
      rawPanes.push({
        session: match[1],
        window: parseInt(match[2], 10),
        pane: parseInt(match[3], 10),
        pid: parseInt(match[4], 10),
        cwd: match[5],
      });
    }

    // Resolve slugs for all unique cwds
    const uniqueCwds = [...new Set(rawPanes.map((p) => p.cwd))];
    const cwdToSlug = new Map<string, string>();
    await Promise.all(
      uniqueCwds.map(async (cwd) => {
        cwdToSlug.set(cwd, await resolveSlugForCwd(cwd));
      })
    );

    return rawPanes.map((p) => ({
      ...p,
      projectSlug: cwdToSlug.get(p.cwd) ?? p.cwd.replace(/[^a-zA-Z0-9-]/g, "-"),
    }));
  } catch {
    return [];
  }
}

export async function cleanupStaleTmuxSessions(): Promise<void> {
  const saved = await getTmuxSessions();
  if (saved.length === 0) return;

  // Get live tmux session names
  let liveSessions: Set<string>;
  try {
    const output = await $`tmux list-sessions -F "#{session_name}"`
      .quiet()
      .text();
    liveSessions = new Set(output.trim().split("\n").filter(Boolean));
  } catch {
    // tmux server not running — all saved sessions are stale
    liveSessions = new Set();
  }

  for (const s of saved) {
    if (!liveSessions.has(s.sessionName)) {
      await removeTmuxSession(s.sessionName);
    }
  }
}
