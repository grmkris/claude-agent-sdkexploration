
# Plan: Fix ExitPlanMode "Approve Does Nothing" Bug

## Root Cause Diagnosis

After thoroughly exploring the codebase, the implementation of `ExitPlanMode` approval is architecturally complete but has **one critical flaw** that causes "approve does nothing":

### The Critical Bug: `send()` Guard Blocks the Resume

In both `use-chat-stream.ts` and `use-root-chat-stream.ts`, the `send()` function has this guard at line 74:

```ts
const send = useCallback(
  (prompt: string, images?: AttachedImage[]) => {
    if (streamingRef.current) return;  // ← THIS IS THE BUG
    ...
  }
)
```

When the user clicks "Approve", `approvePlan()` calls `approvePlanProc` on the backend. The backend resolves the pending promise with `{ behavior: "allow" }`, which **unblocks the SDK**. The SDK immediately starts streaming the continuation (Claude begins implementing). This means `streamingRef.current` **is still `true`** at the moment the approval response comes back (the SSE stream never actually died — it was just blocked on the `canUseTool` promise).

The `approvePlan` hook then checks:
```ts
} else if (result.success && !streamingRef.current) {
  send(" "); // Resume if SSE died
}
```

Since `result.success = true` AND `streamingRef.current = true` (stream is alive), **neither branch triggers `send()`**. That's correct — the stream is alive and running, so no resume needed.

But here's the problem: **the frontend UI never receives the continuation messages**. Why? Because the SSE iterator (`for await (const msg of iterator)`) is still running inside the original `send()` invocation's async closure. When the SDK unblocks after plan approval, the next SDK messages (Claude's implementation output) should flow through the existing SSE connection.

**The actual stuck behavior occurs because:** The SSE connection from the frontend to the backend (`client.chat(...)` or `client.rootChat(...)`) is a **streaming HTTP response**. When `canUseTool` blocks on a Promise for plan approval, the **HTTP response stream is also blocked** — no bytes flow through. The oRPC streaming client is waiting for the next SSE event. Once the Promise resolves, the SDK outputs the next messages through the iterator, which the backend then emits as SSE events — and the frontend receives them normally.

**So why does it "do nothing"?** The real issue is that the SSE stream **times out or gets killed by an intermediate proxy/load balancer** while waiting for the user to approve (which could take many seconds or minutes). When this happens:

1. The frontend's `for await` loop exits (connection dropped)
2. `streamingRef.current` is set to `false`  
3. `setIsStreaming(false)` is called
4. The backend's `cleanupPendingAnswers()` fires, **resolving the pending ExitPlanMode promise with `{ behavior: "deny", message: "Session ended" }`**
5. The `pendingExitPlanMode` entry is **deleted**
6. Now when the user clicks "Approve", `approvePlanProc` finds **no pending entry** (`pendingExitPlanMode.get(toolUseId)` returns `undefined`)
7. It falls through to return `{ success: false, needsResume: true }`
8. The frontend hook calls `send(" ")` to trigger a resume
9. **BUT** — `send(" ")` has the guard `if (streamingRef.current) return` — and here's the timing issue:

**The race condition**: Between step 2 (`streamingRef.current = false`) and step 8 (`send(" ")`), if there's any React re-render or async tick delay, `streamingRef.current` could still read as `false` and `send(" ")` would proceed. But in practice there's another issue:

**The real "does nothing" scenario**: The heartbeat mechanism (20s interval) keeps the SSE alive for AskUserQuestion, but `ExitPlanMode` doesn't update the session state to `waiting_for_permission` in the DB. The `SessionStateBadge` component (used in `ChatView`) polls the session state from DB. When plan mode approval is pending, the session state badge shows "Running..." or "Thinking..." rather than "Waiting for permission", giving no visual feedback that the UI is waiting for the user.

More critically: **the `ExitPlanModeTool` component calls `client.getPendingPlan()` on mount** to fetch the plan text. If this call returns `null` (because the server was restarted, or because `sessionId` is not yet set in the component), the component shows "No PLAN.md found" and the approve/reject buttons are present — but clicking them calls `onApprovePlan(toolUseId, true)` where **`toolUseId` is `undefined`** because it wasn't passed correctly through the prop chain.

### Secondary Bug: `toolUseId` Can Be `undefined` in `ExitPlanModeTool`

In `tool-use-block.tsx` line 46-49:
```ts
toolUseId={isAskUser || isExitPlan ? toolUseId : undefined}
sessionId={isExitPlan ? sessionId : undefined}
onAnswer={isAskUser ? onAnswer : undefined}
onApprovePlan={isExitPlan ? onApprovePlan : undefined}
```

The `toolUseId` prop of `ToolUseBlock` is typed as `string | undefined`. If it arrives as `undefined`, the `ExitPlanModeTool` receives `undefined` for `toolUseId`, and the `handleApprove` guard `if (!toolUseId || ...)` silently does nothing.

### Missing: Session State `waiting_for_permission` for ExitPlanMode

The `session-hooks.ts` sets `waiting_for_permission` state only via the `PreToolUse` hook for permission-denied tools. When `ExitPlanMode` fires and `canUseTool` blocks, the session state in the DB is never updated to `waiting_for_permission`. This means:
- The `SessionStateBadge` shows wrong state
- Push notifications for "Agent needs permission" are never sent for plan approval
- The UI doesn't visually indicate it's waiting for plan approval

### Missing: DB Persistence for ExitPlanMode (Unlike AskUserQuestion)

`AskUserQuestion` uses DB persistence (`upsertPendingQuestion`) to survive server restarts. If the server restarts while waiting for plan approval, `ExitPlanMode` loses its pending state entirely. The `needsResume: true` path triggers a resume, but on resume the SDK re-runs `canUseTool` for `ExitPlanMode` again — this time with a fresh Promise — but there's no stored plan text or approval state to restore. The user would need to wait for Claude to re-plan from scratch.

---

## Implementation Plan

### Fix 1: DB Persistence for ExitPlanMode Pending State (HIGH PRIORITY)

**File: `nextapp/claude-explorer/lib/explorer-db.ts`**

Add a new `pending_plans` table (mirroring `pending_questions`) with:
- `tool_use_id` (TEXT PRIMARY KEY)
- `session_id` (TEXT NOT NULL)
- `plan_text` (TEXT NOT NULL)
- `allowed_prompts` (TEXT NOT NULL) — JSON array
- `tool_input` (TEXT NOT NULL) — JSON object
- `approved` (INTEGER NULL) — NULL = pending, 1 = approved, 0 = rejected
- `feedback` (TEXT NULL) — rejection feedback
- `created_at` (TEXT NOT NULL)

Add CRUD functions:
- `upsertPendingPlan(toolUseId, sessionId, planText, allowedPrompts, toolInput)`
- `getPendingPlan(toolUseId)` — returns the row or null
- `setPrefilledPlanApproval(toolUseId, approved, feedback?)` — stores user decision for resume
- `deletePendingPlan(toolUseId)`
- `deletePendingPlansForSession(sessionId)`

**File: `nextapp/claude-explorer/lib/procedures.ts`**

In `canUseTool` for `ExitPlanMode` (both `chatProc` and `rootChatProc`):
1. Before creating the Promise, call `upsertPendingPlan(...)` to persist to DB
2. Check for pre-approved state first: `const stored = getPendingPlan(opts.toolUseID)` — if `stored?.approved !== null && stored?.approved !== undefined`, auto-resolve immediately (the user approved during a previous stream that died)
3. In `cleanupPendingAnswers`, call `deletePendingPlansForSession(sessionId)` (intentionally do NOT delete — keep the row, same pattern as pending questions)

In `approvePlanProc`:
- Fast path (stream alive): resolve promise AND call `setPrefilledPlanApproval(toolUseId, approved, feedback)` before deleting from DB... wait, actually for consistency with AskUserQuestion: when stream is alive and approval succeeds, delete the DB row. When stream is dead, store the approval decision and return `needsResume: true`.
- Slow path (stream dead, no in-memory entry): Look up DB row via `getPendingPlan(toolUseId)`. If found, call `setPrefilledPlanApproval(toolUseId, approved, feedback)` and return `{ success: false, needsResume: true }`. On resume, `canUseTool` checks for pre-approved state and auto-resolves.

In `getPendingPlanProc`:
- Also check the DB as fallback if the in-memory entry is gone (server restart scenario). This ensures the UI can always show the plan text even after a server restart.

### Fix 2: Set Session State to `waiting_for_permission` for ExitPlanMode (MEDIUM PRIORITY)

**File: `nextapp/claude-explorer/lib/procedures.ts`**

In the `ExitPlanMode` branch of `canUseTool` (both procs), after creating the pending entry, call:
```ts
upsertSession(sessionId!, { state: "waiting_for_permission", current_tool: "ExitPlanMode" });
```

This ensures:
- `SessionStateBadge` shows the correct "Waiting for permission" state
- Push notifications fire ("Agent needs permission")
- The session list sidebar shows the session as needing attention

After the plan is approved/rejected (in `approvePlanProc`), call:
```ts
upsertSession(input.sessionId, { state: "thinking" });
```
to reset the state.

### Fix 3: `getPendingPlanProc` DB Fallback (HIGH PRIORITY)

**File: `nextapp/claude-explorer/lib/procedures.ts`**

The `getPendingPlanProc` currently only checks the in-memory `pendingExitPlanMode` Map. If the server restarts, this map is empty. Update it to fall back to the DB:

```ts
handler: async ({ input }) => {
  // Fast path: in-memory
  const pending = pendingExitPlanMode.get(input.toolUseId);
  if (pending && pending.sessionId === input.sessionId) {
    return { planText: pending.planText, allowedPrompts: pending.allowedPrompts };
  }
  // Slow path: DB fallback (server restart)
  const stored = getPendingPlan(input.toolUseId);
  if (!stored || stored.sessionId !== input.sessionId) return null;
  return { planText: stored.planText, allowedPrompts: stored.allowedPrompts };
}
```

### Fix 4: Ensure `upsertSession` import is available in canUseTool scope (LOW PRIORITY)

Verify that `upsertSession` is imported from `explorer-db` in `procedures.ts`. It already is (used by session hooks), so just confirm the import is present.

### Fix 5: `rootChatProc` Missing `cwd/PLAN.md` Fallback (LOW PRIORITY)

**File: `nextapp/claude-explorer/lib/procedures.ts`**

The `rootChatProc` `canUseTool` is missing the legacy `cwd/PLAN.md` fallback (step 3) that `chatProc` has. Since `rootChatProc` always uses `USER_HOME` as cwd, add the fallback pointing to `USER_HOME/PLAN.md` for consistency.

---

## Files to Modify

| File | Changes |
|---|---|
| `nextapp/claude-explorer/lib/explorer-db.ts` | Add `pending_plans` table + 5 CRUD functions |
| `nextapp/claude-explorer/lib/procedures.ts` | 4 changes: (1) import new DB funcs, (2) `canUseTool` ExitPlanMode branch in both procs: add DB persist + pre-approved check + session state update, (3) `approvePlanProc`: add DB slow path + session state reset, (4) `getPendingPlanProc`: add DB fallback |

## Files NOT Modified

- `exit-plan-mode-tool.tsx` — the UI component is correct
- `use-chat-stream.ts` / `use-root-chat-stream.ts` — the `approvePlan` hook is correct
- `message-bubble.tsx` / `tool-use-block.tsx` — prop passing is correct
- All page files — correct

## Implementation Order

1. `explorer-db.ts` — add table + functions (no dependencies)
2. `procedures.ts` — update imports, then `canUseTool` blocks, then `approvePlanProc`, then `getPendingPlanProc`
