/**
 * 08 - Session Explorer
 * Browse all Claude sessions across all projects on the filesystem.
 *
 * Run: bun examples/08-session-explorer.ts
 */
import { homedir } from "os";
import { readdir } from "fs/promises";
import path from "path";

interface SessionInfo {
  id: string;
  project: string;
  messageCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  models: Set<string>;
  userMessages: number;
  assistantMessages: number;
}

const projectsDir = path.join(homedir(), ".claude", "projects");

async function exploreProjects() {
  let entries: string[];
  try {
    entries = await readdir(projectsDir);
  } catch {
    console.log("No projects directory found at ~/.claude/projects/");
    return;
  }

  const allSessions: SessionInfo[] = [];

  for (const projectSlug of entries) {
    const projectPath = path.join(projectsDir, projectSlug);
    const stat = await Bun.file(projectPath).exists();

    let files: string[];
    try {
      files = await readdir(projectPath);
    } catch {
      continue;
    }

    const sessionFiles = files.filter((f) => f.endsWith(".jsonl"));

    for (const sessionFile of sessionFiles) {
      const sessionId = sessionFile.replace(".jsonl", "");
      const filePath = path.join(projectPath, sessionFile);

      try {
        const content = await Bun.file(filePath).text();
        const lines = content.trim().split("\n");

        const info: SessionInfo = {
          id: sessionId,
          project: projectSlug,
          messageCount: lines.length,
          firstTimestamp: "",
          lastTimestamp: "",
          models: new Set(),
          userMessages: 0,
          assistantMessages: 0,
        };

        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            if (obj.timestamp) {
              if (!info.firstTimestamp) info.firstTimestamp = obj.timestamp;
              info.lastTimestamp = obj.timestamp;
            }
            if (obj.type === "user") info.userMessages++;
            if (obj.type === "assistant") {
              info.assistantMessages++;
              if (obj.message?.model) info.models.add(obj.message.model);
            }
          } catch {}
        }

        allSessions.push(info);
      } catch {}
    }
  }

  // Sort by most recent first
  allSessions.sort((a, b) => b.lastTimestamp.localeCompare(a.lastTimestamp));

  console.log(`Found ${allSessions.length} sessions across ${new Set(allSessions.map((s) => s.project)).size} projects\n`);

  // Group by project
  const byProject = new Map<string, SessionInfo[]>();
  for (const session of allSessions) {
    const existing = byProject.get(session.project) ?? [];
    existing.push(session);
    byProject.set(session.project, existing);
  }

  for (const [project, sessions] of byProject) {
    // Convert slug back to path
    const projectPath = project.startsWith("-") ? project.slice(1).replace(/-/g, "/") : project;
    console.log(`\n--- /${projectPath} (${sessions.length} sessions) ---`);

    for (const s of sessions.slice(0, 5)) {
      const models = [...s.models].join(", ") || "unknown";
      const timeAgo = getTimeAgo(s.lastTimestamp);
      console.log(`  ${s.id.slice(0, 8)}... | ${s.userMessages} user / ${s.assistantMessages} assistant msgs | ${models} | ${timeAgo}`);
    }

    if (sessions.length > 5) {
      console.log(`  ... and ${sessions.length - 5} more`);
    }
  }

  console.log("\n---");
  console.log(`\nTo resume any session: claude --resume <session-id>`);
  console.log("To resume via SDK:     query({ prompt: '...', options: { resume: '<session-id>' } })");
}

function getTimeAgo(timestamp: string): string {
  if (!timestamp) return "unknown";
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

await exploreProjects();
