# Plan: Tmux Launcher — Popover Redesign + SSH/-CC Improvements

## What the user wants
1. **`-CC` mode** (iTerm2 `tmux -CC`) as a visible, easy checkbox — currently missing from the UI entirely
2. **SSH** more accessible — currently buried inside the "Options" accordion that's collapsed by default
3. **Possibly convert to a popover** — the current collapsible `TmuxLauncherSection` is a tall section in the sidebar

## My recommendation: Yes, go with the popover

The current sidebar layout has two separate tmux sections:
```
┌─── Tmux Sessions ────────────────┐
│  ● claude-myproject         [↵]  │
└──────────────────────────────────┘
┌─── Launch Tmux Session ▼ ────────┐  ← collapsible, can be tall
│  Panels  [1][2][3][4]            │
│  Layout  [Side by side ▾]        │
│  Pane 1  [New session ▾]         │
│  ▶ Options                       │  ← SSH + -CC buried here
│  tmux new-session ...            │
│  [Copy command]                  │
└──────────────────────────────────┘
```

**After the redesign**, these merge into one compact section:
```
┌─── Tmux ─────────────────── [⊕] ┐  ← [⊕] opens launcher popover
│  ● claude-myproject         [↵]  │
│  ○ other-session            [↵]  │
└──────────────────────────────────┘
```

The `[⊕]` button opens a **Popover** floating to the right/left of the sidebar with the full launcher form — now with `-CC` and SSH always visible at the top, no accordion needed:

```
┌─────────────────────────────────────┐
│  Launch Tmux Session                │
│ ─────────────────────────────────── │
│  Panels  [1] [2] [3] [4]  ☐ -CC   │  ← -CC on same row as panels
│  Layout  [Side by side ▾]           │  (only shows when panels > 1)
│  Pane 1  [New session     ▾]        │
│  SSH     [user@host            ]    │  ← always visible, no accordion
│  Flags   ☐ skip-perms  Model [▾]   │
│ ─────────────────────────────────── │
│  tmux new-session -s claude-... \   │  ← scrollable code block
│  [Copy command]                     │
└─────────────────────────────────────┘
```

### Why this is better than alternatives

| Approach | Pros | Cons |
|---|---|---|
| Add -CC checkbox to existing Options accordion | Minimal change | -CC still buried, SSH still buried, sidebar still tall |
| Add -CC checkbox inline, move SSH to top | Better visibility | Sidebar still tall when launcher is open |
| **Popover (recommended)** | Sidebar stays compact always; -CC + SSH always visible; launcher is wider so command preview is readable; one section instead of two | Slightly more code |

---

## Implementation Plan

### Files to change
| File | Change |
|---|---|
| `components/tmux-launcher.tsx` | Add `ccMode` state + checkbox; remove inner Options accordion (flatten); pass `ccMode` to `generateTmuxCommand` |
| `components/right-sidebar/overview-tab.tsx` | Merge `ProjectTmuxSection` + `TmuxLauncherSection` into one `TmuxSection` that has a Popover trigger |

### Step 1 — `components/tmux-launcher.tsx`: Add `-CC` + flatten options

Add `ccMode` state and checkbox. Remove the collapsible "Options" sub-accordion — instead, SSH, `-CC`, skip-perms, and model are always shown.

**New state:**
```ts
const [ccMode, setCcMode] = useState(false);
```

**New row: Panels + -CC on same line:**
```tsx
{/* Panels */}
<div className="flex items-center gap-1.5">
  <span className="w-10 shrink-0 text-[10px] text-muted-foreground">Panels</span>
  <div className="flex flex-1 gap-0.5">
    {([1, 2, 3, 4] as const).map((n) => (
      <button key={n} onClick={() => handlePanelCount(n)} className={...}>
        {n}
      </button>
    ))}
  </div>
  {/* -CC toggle on the right */}
  <label className="flex cursor-pointer items-center gap-1">
    <input
      type="checkbox"
      checked={ccMode}
      onChange={(e) => setCcMode(e.target.checked)}
      className="h-3 w-3 accent-primary"
    />
    <span className="text-[10px] text-muted-foreground">-CC</span>
  </label>
</div>
```

**SSH row always visible (remove from Options accordion):**
```tsx
<div className="flex items-center gap-1.5">
  <span className="w-10 shrink-0 text-[10px] text-muted-foreground">SSH</span>
  <input
    type="text"
    value={sshTarget}
    onChange={(e) => setSshTarget(e.target.value)}
    placeholder="user@host (optional)"
    className="h-6 flex-1 rounded bg-muted/50 px-1.5 font-mono text-[10px] ..."
  />
</div>
```

**Flags row (skip-perms + model, compact, always visible):**
```tsx
<div className="flex items-center gap-1.5">
  <span className="w-10 shrink-0 text-[10px] text-muted-foreground">Flags</span>
  <label className="flex cursor-pointer items-center gap-1">
    <input type="checkbox" checked={skipPermissions} onChange={...} className="h-3 w-3 accent-primary" />
    <span className="text-[10px]">skip-perms</span>
  </label>
  <div className="ml-auto">
    <Select value={model} onValueChange={...}>...</Select>
  </div>
</div>
```

**Pass `ccMode` to `generateTmuxCommand`:**
```ts
const command = projectPath
  ? generateTmuxCommand({
      sessionName,
      projectPath,
      panelCount,
      layout,
      resumeSessionIds: resumeIds,
      skipPermissions,
      model: model || undefined,
      sshTarget: sshTarget || undefined,
      ccMode,  // ← NEW
    })
  : null;
```

---

### Step 2 — `components/right-sidebar/overview-tab.tsx`: Merge into one Popover section

Replace `ProjectTmuxSection` + `TmuxLauncherSection` with a single `TmuxSection`:

```tsx
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function TmuxSection({ slug }: { slug: string }) {
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const project = projects?.find((p) => p.slug === slug);

  return (
    <SidebarGroup>
      {/* Header row: label + launch button */}
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-[11px] font-medium text-sidebar-foreground/70">
          Tmux Sessions
        </span>
        <Popover>
          <PopoverTrigger
            className="rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            title="Launch new tmux session"
          >
            {/* Plus / terminal icon */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <rect width="20" height="14" x="2" y="3" rx="2" />
              <path d="m8 10 2 2-2 2" />
              <path d="M12 14h4" />
            </svg>
          </PopoverTrigger>
          <PopoverContent side="left" align="start" sideOffset={8} className="w-80 p-3">
            <div className="mb-2 text-xs font-medium">Launch Tmux Session</div>
            <TmuxLauncher slug={slug} projectPath={project?.path ?? null} />
          </PopoverContent>
        </Popover>
      </div>

      {/* Active sessions list */}
      <SidebarGroupContent>
        <TmuxSessionsPanel filterProjectPath={project?.path} />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
```

Remove both `ProjectTmuxSection` and `TmuxLauncherSection` from `OverviewTab`, replace with `<TmuxSection slug={slug} />`.

---

## Risk / Notes
- `ccMode` just passes to `generateTmuxCommand` which already has full support for it — the backend/command generation needs zero changes
- Removing the inner Options accordion makes the launcher slightly taller when open, but since it's now in a popover (not inline in the sidebar), that's fine — popovers scroll naturally
- `PopoverContent` default width is `w-72` (from the existing component). We'll override to `w-80` for the launcher to give the command preview more room
- The `side="left"` positions the popover to the left of the sidebar trigger, which makes sense since the left sidebar is on the left edge of the screen. If this causes clipping, use `side="right"` or `side="bottom"` — test both

## Files changed summary
- `components/tmux-launcher.tsx` — add `ccMode` state + checkbox, flatten SSH/flags out of accordion
- `components/right-sidebar/overview-tab.tsx` — replace two tmux sections with one `TmuxSection` using Popover
