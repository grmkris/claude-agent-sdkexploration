import { $ } from "bun";

import type { TmuxPane } from "./types";

// Match the same encoding Claude CLI uses for project directories
// by reading actual dir names from ~/.claude/projects/
import { resolveSlugForCwd } from "./claude-fs";

export type TmuxSession = {
  name: string;
  windows: number;
  created: Date;
  attached: boolean;
};

export async function getTmuxSessions(): Promise<TmuxSession[]> {
  try {
    const output =
      await $`tmux list-sessions -F "#{session_name}\t#{session_windows}\t#{session_created}\t#{session_attached}"`
        .quiet()
        .text();

    const sessions: TmuxSession[] = [];
    for (const line of output.trim().split("\n")) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      if (parts.length < 4) continue;
      const [name, windowsStr, createdStr, attachedStr] = parts;
      sessions.push({
        name: name.trim(),
        windows: parseInt(windowsStr, 10) || 0,
        created: new Date(parseInt(createdStr, 10) * 1000),
        attached: attachedStr.trim() === "1",
      });
    }
    return sessions;
  } catch {
    return [];
  }
}

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
