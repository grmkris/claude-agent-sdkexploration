# Fix: Plan Mode Viewer Showing Wrong/Stale Plan Files

## Problem

When a Claude agent enters plan mode and calls `ExitPlanMode`, the UI frequently shows the wrong plan — typically a plan from a previous session. This happens because the plan file resolution heuristic in `procedures.ts` is unreliable.

## Root Cause

The `canUseTool("ExitPlanMode", ...)` handler in both `chatProc` (line 832) and `rootChatProc` (line 2014) uses a 3-step heuristic to find the plan file:

1. **Explicit path** — checks `typedInput.planFilePath`, but the `ExitPlanMode` tool schema has NO such parameter, so this always fails
2. **60-second scan** — scans `~/.claude/plans/` for the most recently modified `.md` file within 60 seconds, but this fails when the agent takes longer than 60s to explore before calling ExitPlanMode, or when concurrent sessions write plans
3. **Legacy fallback** — reads `cwd/PLAN.md` (uppercase only), which picks up stale files from previous sessions

The specific bug: the current session wrote to `plan.md` (lowercase), step 2 missed it (>60s), and step 3 read the old `PLAN.md` (uppercase) from a completely different session.

## Fix

Replace the fragile 3-step sequential heuristic with: **collect ALL candidate plan files, pick the most recently modified one.**

### Changes to `procedures.ts`

Replace the plan file resolution in both `chatProc` (lines ~842-896) and `rootChatProc` (lines ~2016-2063) with a unified approach:

```typescript
// Collect all candidate plan files with their mtimes
const candidates: Array<{ path: string; mtimeMs: number }> = [];

// 1. Explicit path from tool input (keep for forward-compat)
const explicitPath =
  (typedInput.planFilePath as string | undefined) ??
  (typedInput.plan_file_path as string | undefined);
if (explicitPath) {
  const stat = await fsStat(explicitPath).catch(() => null);
  if (stat) candidates.push({ path: explicitPath, mtimeMs: stat.mtimeMs });
}

// 2. ALL .md files in ~/.claude/plans/ — NO 60-second cutoff
try {
  const files = await readdir(plansDir);
  const mdFiles = files.filter((f) => f.endsWith(".md"));
  const stats = await Promise.all(
    mdFiles.map(async (f) => {
      const p = join(plansDir, f);
      const s = await fsStat(p).catch(() => null);
      return s ? { path: p, mtimeMs: s.mtimeMs } : null;
    })
  );
  for (const s of stats) if (s) candidates.push(s);
} catch {
  // ~/.claude/plans/ may not exist
}

// 3. Check BOTH plan.md and PLAN.md in cwd
if (input.cwd) {
  for (const name of ["PLAN.md", "plan.md"]) {
    const p = join(input.cwd, name);
    const s = await fsStat(p).catch(() => null);
    if (s) candidates.push({ path: p, mtimeMs: s.mtimeMs });
  }
}

// Pick the most recently modified candidate
candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
if (candidates.length > 0) {
  const best = candidates[0];
  planText = await readFile(best.path, "utf-8").catch(() => "");
  if (planText) planFilePath = best.path;
}
```

### Key improvements over current code

| Current | Fixed |
|---------|-------|
| 60-second cutoff in `~/.claude/plans/` scan — misses plans when agent takes >1 min | No time cutoff — always picks newest file |
| Only checks `PLAN.md` (uppercase) in cwd | Checks both `PLAN.md` and `plan.md` |
| Sequential fallback (first match wins, even if stale) | Collects all candidates, newest mtime wins |
| `rootChatProc` missing cwd fallback entirely | Both handlers get identical logic |
| Wrong file silently cached forever in DB | Most-recent-mtime heuristic is much more reliable |

### Files to modify

| File | Lines | Change |
|------|-------|--------|
| `nextapp/claude-explorer/lib/procedures.ts` | ~842-896 | Replace plan resolution in `chatProc` |
| `nextapp/claude-explorer/lib/procedures.ts` | ~2016-2063 | Replace plan resolution in `rootChatProc` (identical logic) |

### What stays unchanged
- DB persistence / in-memory caching (already correct, keyed by `toolUseId`)
- Frontend `ExitPlanModeTool` component (already correct)
- `getPendingPlanProc` endpoint (already session-scoped)
- Approval/rejection flow

### Risk: Low
- Only affects which file is selected when `ExitPlanMode` fires
- If no plan files exist anywhere, behavior is unchanged (empty text)
- Edge case: concurrent sessions writing plans within seconds — newest wins, which is better than the current behavior (wrong file or no file)
