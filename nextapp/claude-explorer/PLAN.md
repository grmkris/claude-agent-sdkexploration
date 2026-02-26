# Implementation Plan: Features 05, 07, 08

> Written 2026-02-26. These three features are the next batch to implement.
> Each section has a complexity rating, exact file list, and step-by-step instructions.

---

## Feature 07 — Sidebar Recent Activities & Worktrees *(do first)*

**Complexity:** Low-Medium
**Risk:** Low (additive only, both sections return null when nothing to show)

### What it is
Inside the **left sidebar Overview tab** for a project:
1. **Recent Activities** — show last 5 sessions for this project (first prompt + time ago + state badge)
2. **Worktree Info** — if the project repo has multiple git worktrees, list them with branch + commit + current indicator

### Files to change
| File | Action |
|------|--------|
| `lib/claude-fs.ts` | Add `getGitWorktrees()` function |
| `lib/procedures.ts` | Add `gitWorktreesProc`, register as `orpc.projects.gitWorktrees` |
| `components/right-sidebar/recent-activities-section.tsx` | **NEW** |
| `components/right-sidebar/worktree-info-section.tsx` | **NEW** |
| `components/right-sidebar/overview-tab.tsx` | Mount both sections |

### Step-by-step

#### Step 1 — `lib/claude-fs.ts`: Add `getGitWorktrees()`
```ts
export type GitWorktree = {
  path: string;
  head: string;       // short SHA
  branch: string;     // "main", "feat/foo", "(detached)" etc.
  isMain: boolean;    // first entry from git is the main worktree
  isCurrent: boolean; // path === projectPath
};

export async function getGitWorktrees(projectPath: string): Promise<GitWorktree[]> {
  // Run: git -C <projectPath> worktree list --porcelain
  // Blocks are separated by blank lines; each block has:
  //   worktree <path>
  //   HEAD <sha>
  //   branch refs/heads/<name>   (or "detached")
  // Return [] if not a git repo or only 1 worktree (nothing interesting)
  // Wrap entire function in try/catch → return [] on any error
}
```

#### Step 2 — `lib/procedures.ts`: Add `gitWorktreesProc`
```ts
const GitWorktreeSchema = z.object({
  path: z.string(),
  head: z.string(),
  branch: z.string(),
  isMain: z.boolean(),
  isCurrent: z.boolean(),
});

const gitWorktreesProc = os
  .input(z.object({ slug: z.string() }))
  .output(z.array(GitWorktreeSchema))
  .handler(async ({ input }) => {
    const projectPath = await resolveSlugToPath(input.slug);
    return getGitWorktrees(projectPath);
  });

// Register under projects:
gitWorktrees: gitWorktreesProc,
```

**Note:** `recentActivitiesProc` is NOT needed — the existing `sessions.timeline` with `{ slug, limit: 5 }` already does this (implemented in Feature 12).

#### Step 3 — NEW `components/right-sidebar/recent-activities-section.tsx`
```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { SessionStateBadge } from "@/components/session-state-badge";
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";
import { getTimeAgo } from "@/lib/utils";

export function RecentActivitiesSection({ slug }: { slug: string }) {
  const { data: sessions } = useQuery({
    ...orpc.sessions.timeline.queryOptions({ input: { slug, limit: 5 } }),
    refetchInterval: 15_000,
  });

  if (!sessions?.length) return null;

  return (
    <SidebarGroup>
      <div className="px-2 pb-1 text-[11px] font-medium text-sidebar-foreground/70">
        Recent Activity
      </div>
      <SidebarGroupContent>
        <div className="flex flex-col gap-0.5">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/project/${slug}/chat/${session.id}`}
              className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-sidebar-accent transition-colors"
            >
              <SessionStateBadge sessionId={session.id} compact />
              <span className="flex-1 truncate text-muted-foreground">
                {session.firstPrompt ?? "Untitled"}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground/60">
                {getTimeAgo(session.lastModified ?? session.timestamp)}
              </span>
            </Link>
          ))}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
```

#### Step 4 — NEW `components/right-sidebar/worktree-info-section.tsx`
```tsx
"use client";

import { useQuery } from "@tanstack/react-query";

import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

export function WorktreeInfoSection({ slug }: { slug: string }) {
  const { data: worktrees } = useQuery(
    orpc.projects.gitWorktrees.queryOptions({ input: { slug } })
  );

  // Only render when there are 2+ worktrees
  if (!worktrees || worktrees.length < 2) return null;

  return (
    <SidebarGroup>
      <div className="px-2 pb-1 text-[11px] font-medium text-sidebar-foreground/70">
        Git Worktrees
      </div>
      <SidebarGroupContent>
        <div className="flex flex-col gap-0.5 px-2">
          {worktrees.map((wt) => (
            <div key={wt.path} className="flex items-center gap-2 py-0.5 text-xs">
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  wt.isCurrent ? "bg-green-400" : "bg-muted-foreground/30"
                )}
              />
              <span className="flex-1 truncate font-mono text-[10px]">
                {wt.branch}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
                {wt.head.slice(0, 7)}
              </span>
            </div>
          ))}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
```

#### Step 5 — `components/right-sidebar/overview-tab.tsx`: Mount both sections
Import and add after `<ProjectCursorSection slug={slug} />`:
```tsx
import { RecentActivitiesSection } from "@/components/right-sidebar/recent-activities-section";
import { WorktreeInfoSection } from "@/components/right-sidebar/worktree-info-section";

// In OverviewTab return:
<ProjectCursorSection slug={slug} />
<RecentActivitiesSection slug={slug} />
<WorktreeInfoSection slug={slug} />
<IntegrationsSection slug={slug} />
```

### Notes
- `getGitWorktrees` wraps shell call in try/catch → returns `[]` on any error (non-git repo, no git binary, etc.)
- `WorktreeInfoSection` is invisible when repo has 0 or 1 worktrees — no empty state needed
- `RecentActivitiesSection` is invisible when project has no sessions yet

---

## Feature 08 — Tmux Sessions Panel *(do second)*

**Complexity:** Medium
**Risk:** Low (additive; tmux not installed → empty list, not an error)

### What it is
1. A new **`TmuxSessionsPanel`** component listing active tmux sessions with one-click copy of attach command
2. A **`ProjectTmuxSection`** in the Overview tab showing sessions for the current project
3. A new `/tmux` global page with the full session list
4. **"Tmux"** added to the global nav sidebar

### Existing infrastructure to build on
- `lib/tmux.ts` — `getTmuxPanes()` (runs `tmux list-panes -a`)
- `lib/tmux-command.ts` — `generateAttachCommand({ sessionName, sshTarget, ccMode })`
- `lib/procedures.ts` — `tmux.panes` procedure
- `components/session-actions-menu.tsx` — copy tmux command pattern (clipboard + check icon)

### Files to change
| File | Action |
|------|--------|
| `lib/tmux.ts` | Add `TmuxSession` type + `getTmuxSessions()` function |
| `lib/procedures.ts` | Add `tmuxSessionsProc`, register as `orpc.tmux.sessions` |
| `components/tmux-sessions-panel.tsx` | **NEW** reusable panel component |
| `components/right-sidebar/overview-tab.tsx` | Add `ProjectTmuxSection` |
| `components/project-sidebar.tsx` | Add Tmux entry to `GLOBAL_NAV` |
| `app/tmux/page.tsx` | **NEW** full-page tmux view |

### Step-by-step

#### Step 1 — `lib/tmux.ts`: Add `getTmuxSessions()`
```ts
export type TmuxSession = {
  name: string;
  windows: number;
  created: Date;
  attached: boolean;
};

export async function getTmuxSessions(): Promise<TmuxSession[]> {
  // Command: tmux list-sessions -F "#{session_name}\t#{session_windows}\t#{session_created}\t#{session_attached}"
  // Each line → split by \t → parse into TmuxSession
  // session_created is unix timestamp (seconds) → new Date(ts * 1000)
  // session_attached is "1" or "0"
  // Return [] if tmux not installed (catch ENOENT) or no server running (exit code 1)
}
```

#### Step 2 — `lib/procedures.ts`: Add `tmuxSessionsProc`
```ts
const TmuxSessionSchema = z.object({
  name: z.string(),
  windows: z.number(),
  created: z.date(),
  attached: z.boolean(),
});

const tmuxSessionsProc = os
  .output(z.array(TmuxSessionSchema))
  .handler(async () => getTmuxSessions());

// In tmux sub-router (add alongside existing panes):
sessions: tmuxSessionsProc,
```

#### Step 3 — NEW `components/tmux-sessions-panel.tsx`
```tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { generateAttachCommand } from "@/lib/tmux-command";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

// Inline SVG icons (same style as session-actions-menu.tsx)
function CopyIcon({ className }: { className?: string }) { ... }
function CheckIcon({ className }: { className?: string }) { ... }

export function TmuxSessionsPanel({
  filterProjectPath,
}: {
  filterProjectPath?: string | null;
}) {
  const [copiedSession, setCopiedSession] = useState<string | null>(null);

  const { data: sessions, isLoading } = useQuery({
    ...orpc.tmux.sessions.queryOptions(),
    refetchInterval: 15_000,
  });

  const { data: serverConfig } = useQuery(orpc.server.config.queryOptions());

  // Project-scoped filter: match sessions whose name contains the last dir segment
  const projectDirName = filterProjectPath?.split("/").at(-1);
  const filtered = projectDirName
    ? sessions?.filter((s) => s.name.includes(projectDirName))
    : sessions;

  if (isLoading) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground animate-pulse">
        Loading…
      </div>
    );
  }

  if (!filtered?.length) return null;

  return (
    <div className="flex flex-col gap-0.5 px-2">
      {filtered.map((session) => {
        const attachCmd = generateAttachCommand({
          sessionName: session.name,
          sshTarget: serverConfig?.sshHost ?? undefined,
        });
        const copied = copiedSession === session.name;

        return (
          <div
            key={session.name}
            className="flex items-center gap-2 rounded py-1 text-xs hover:bg-sidebar-accent px-1 transition-colors"
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                session.attached ? "bg-green-400" : "bg-muted-foreground/40"
              )}
            />
            <span className="flex-1 truncate font-mono text-[11px]">
              {session.name}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground/60">
              {session.windows}w
            </span>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(attachCmd);
                setCopiedSession(session.name);
                setTimeout(() => setCopiedSession(null), 1500);
              }}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title={attachCmd}
            >
              {copied ? (
                <CheckIcon className="h-3 w-3 text-green-400" />
              ) : (
                <CopyIcon className="h-3 w-3" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

#### Step 4 — `components/right-sidebar/overview-tab.tsx`: Add `ProjectTmuxSection`
Add inline in the file (no new file needed):
```tsx
import { TmuxSessionsPanel } from "@/components/tmux-sessions-panel";

function ProjectTmuxSection({ slug }: { slug: string }) {
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const project = projects?.find((p) => p.slug === slug);

  return (
    <SidebarGroup>
      <div className="px-2 pb-1 text-[11px] font-medium text-sidebar-foreground/70">
        Tmux Sessions
      </div>
      <SidebarGroupContent>
        <TmuxSessionsPanel filterProjectPath={project?.path} />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
```
Mount after `<ProjectCursorSection />` in `OverviewTab`.

#### Step 5 — `components/project-sidebar.tsx`: Add to `GLOBAL_NAV`
```ts
{ href: "/tmux", label: "Tmux", tooltip: "Tmux Sessions" },
```
Add after the existing **Crons** entry.

#### Step 6 — NEW `app/tmux/page.tsx`
```tsx
import { TmuxSessionsPanel } from "@/components/tmux-sessions-panel";

export default function TmuxPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-4 text-lg font-semibold">Tmux Sessions</h1>
      <TmuxSessionsPanel />
    </main>
  );
}
```

### Notes
- `getTmuxSessions()` must catch `ENOENT` (tmux not installed) **and** non-zero exit (no tmux server running) → return `[]` in both cases
- The project filter is fuzzy (session name *contains* the last dir segment) — good enough as a starting heuristic
- The `~/.devs` directory filtering mentioned in the raw feature notes is low priority — skip for now
- `app/tmux/page.tsx` is a server component — `TmuxSessionsPanel` is client-only, that's fine

---

## Feature 05 — Project Creation Templates *(do third)*

**Complexity:** Medium
**Risk:** Low-Medium (adds fields to existing form, extends existing procedure)

### What it is
When creating a new project, the user can:
1. Pick a **template** (e.g. "Next.js Fullstack", "AI Agent", "Blank") that pre-fills MCPs, skills, and an initial prompt
2. Manually select **MCPs** from the existing `MCP_CATALOG`
3. Manually select **skills** from the existing `SUGGESTED_SKILLS`

### Files to change
| File | Action |
|------|--------|
| `lib/mcp-catalog.ts` | Add `ProjectTemplate` interface + `PROJECT_TEMPLATES` array |
| `lib/procedures.ts` | Extend `createProjectProc` input + post-creation MCP/skill install |
| `app/page.tsx` | Expand `NewProjectForm` with template cards + MCP/skill pickers |

### Step-by-step

#### Step 1 — `lib/mcp-catalog.ts`: Add templates
```ts
export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  emoji: string;
  mcpIds: string[];    // must match id fields in MCP_CATALOG
  skillIds: string[];  // must match id fields in SUGGESTED_SKILLS
  initialPrompt?: string;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "blank",
    name: "Blank",
    description: "Start from scratch",
    emoji: "📄",
    mcpIds: [],
    skillIds: [],
  },
  {
    id: "nextjs",
    name: "Next.js Fullstack",
    description: "Web app with filesystem & browser tools",
    emoji: "⚡",
    mcpIds: ["filesystem", "browser"],
    skillIds: ["react", "typescript"],
    initialPrompt: "Set up a Next.js 15 project with TypeScript and Tailwind CSS.",
  },
  {
    id: "api-service",
    name: "API Service",
    description: "Backend service with database access",
    emoji: "🔌",
    mcpIds: ["filesystem"],
    skillIds: ["typescript"],
    initialPrompt: "Create a REST API service.",
  },
  {
    id: "ai-agent",
    name: "AI Agent",
    description: "Agent with memory and web access",
    emoji: "🤖",
    mcpIds: ["memory", "browser", "fetch"],
    skillIds: [],
    initialPrompt: "Build an AI agent that can search the web and remember information.",
  },
];
```

#### Step 2 — `lib/procedures.ts`: Extend `createProjectProc`
Find the existing proc and add to its input schema:
```ts
mcps: z.array(z.string()).optional(),
skills: z.array(z.string()).optional(),
```
After directory creation and before running the initial prompt, add:
```ts
// Install selected MCPs
if (input.mcps?.length) {
  for (const mcpId of input.mcps) {
    const entry = MCP_CATALOG.find((m) => m.id === mcpId);
    if (entry?.installCmd) {
      // installCmd format: "claude mcp add ..."
      const args = entry.installCmd.split(" ").slice(2); // drop "claude mcp"
      await runClaudeCli(["mcp", ...args], { cwd: newPath });
    }
  }
}
// Install selected skills
if (input.skills?.length) {
  for (const skillId of input.skills) {
    await runClaudeCli(["skills", "add", skillId], { cwd: newPath });
  }
}
```

#### Step 3 — `app/page.tsx`: Expand `NewProjectForm`
Add state:
```ts
const [selectedTemplate, setSelectedTemplate] = useState<string>("blank");
const [selectedMcps, setSelectedMcps] = useState<string[]>([]);
const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
const [showMcpPicker, setShowMcpPicker] = useState(false);
const [showSkillPicker, setShowSkillPicker] = useState(false);
```

UI additions (in order, above the existing fields):
1. **Template cards row** — horizontal scrollable row of small cards (`PROJECT_TEMPLATES`). Clicking a card:
   - sets `selectedTemplate`
   - pre-fills `selectedMcps` and `selectedSkills` from template
   - pre-fills `initialPrompt` from template
2. **"MCPs" collapsible section** — toggle button → checkbox list from `MCP_CATALOG`
3. **"Skills" collapsible section** — toggle button → checkbox list from `SUGGESTED_SKILLS`

Pass to mutation call:
```ts
mcps: selectedMcps,
skills: selectedSkills,
```

### Notes
- "Blank" template is default — no MCPs, no skills, no pre-filled prompt
- MCP env var inputs (for MCPs that need API keys) are low priority — skip for now
- Template cards should be compact (2–3 lines: emoji + name + description)
- If the user manually deselects something after picking a template, that's fine — templates just pre-fill, they don't lock anything

---

## Implementation Order & Checklist

```
[ ] Feature 07 — Recent Activities & Worktrees
    [ ] Add getGitWorktrees() to lib/claude-fs.ts
    [ ] Add gitWorktreesProc to lib/procedures.ts
    [ ] Create recent-activities-section.tsx
    [ ] Create worktree-info-section.tsx
    [ ] Mount both in overview-tab.tsx
    [ ] bun run typecheck → green
    [ ] Commit

[ ] Feature 08 — Tmux Sessions Panel
    [ ] Add getTmuxSessions() to lib/tmux.ts
    [ ] Add tmuxSessionsProc to lib/procedures.ts
    [ ] Create tmux-sessions-panel.tsx
    [ ] Add ProjectTmuxSection to overview-tab.tsx
    [ ] Add Tmux to GLOBAL_NAV in project-sidebar.tsx
    [ ] Create app/tmux/page.tsx
    [ ] bun run typecheck → green
    [ ] Commit

[ ] Feature 05 — Project Creation Templates
    [ ] Add ProjectTemplate + PROJECT_TEMPLATES to mcp-catalog.ts
    [ ] Extend createProjectProc input in procedures.ts
    [ ] Expand NewProjectForm in app/page.tsx
    [ ] bun run typecheck → green
    [ ] Commit
```
