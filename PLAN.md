# Plan Mode Toggle – Implementation Plan

## Background & Research Summary

We explored the codebase and the Claude Agent SDK docs to understand how plan mode works and how to add a UI toggle for it.

### What Plan Mode Is
- `permissionMode: "plan"` is one of 5 SDK permission modes.
- It restricts Claude to **read-only tools only** (Read, Glob, Grep, AskUserQuestion) and **prevents any mutating tool execution**.
- Internally it injects a system-level instruction telling the model not to make edits or run non-readonly tools.
- Claude uses `ExitPlanMode` (a built-in SDK tool) to signal when its plan is ready and hand it off for user approval.
- After approval, the session exits plan mode and Claude proceeds with implementation.

### How Existing Modes Work (Thinking, Auto-approve)
- `ChatSettings` type in `chat-settings-bar.tsx` holds boolean flags.
- Each flag maps to a backend enum in `permissionMode` or `thinking`.
- Both page variants (`/chat`, `/chat/[sessionId]`, `/project/[slug]/chat`, `/project/[slug]/chat/[sessionId]`) and the root chat pages hold `settings` state and pass it to `useChatStream` / `useRootChatStream`.
- The backend (`procedures.ts`) receives `permissionMode` and passes it straight to the SDK's `query()`.

### Current `permissionMode` Logic
```
bypassPermissions = true  → permissionMode: "bypassPermissions"
bypassPermissions = false → permissionMode: "default"
```
Plan mode currently has NO UI toggle — it exists in the type system but is not exposed.

### Plan Mode Status Detection
- The `SDKSystemMessage` (subtype `init`) carries `permissionMode` as a **required** field.
- The `SDKStatusMessage` (subtype `status`) carries `permissionMode` as an **optional** field.
- Currently the frontend ignores `permissionMode` in both messages.
- To show "currently in plan mode" status we can read `permissionMode` from the `init` message and track it in state.

---

## Files to Modify (4 component files + 4 page files)

| File | Change |
|------|--------|
| `components/chat-settings-bar.tsx` | Add `planMode: boolean` to `ChatSettings`, add UI toggle |
| `app/project/[slug]/chat/page.tsx` | Update `permissionMode` logic |
| `app/project/[slug]/chat/[sessionId]/page.tsx` | Update `permissionMode` logic |
| `app/chat/page.tsx` | Update `permissionMode` logic |
| `app/chat/[sessionId]/page.tsx` | Update `permissionMode` logic |
| `hooks/sdk-message-handler.ts` | Extract `permissionMode` from `init` message; expose a setter |
| `hooks/use-chat-stream.ts` | Thread `onPermissionModeChange` callback |
| `hooks/use-root-chat-stream.ts` | Thread `onPermissionModeChange` callback |

---

## Step-by-Step Implementation

### Step 1 – Update `ChatSettings` type and default (`chat-settings-bar.tsx`)

```typescript
export type ChatSettings = {
  thinkingEnabled: boolean;
  bypassPermissions: boolean;
  planMode: boolean;        // NEW
};

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  thinkingEnabled: false,
  bypassPermissions: true,
  planMode: false,          // NEW – off by default
};
```

### Step 2 – Add the Plan Mode Toggle UI (`chat-settings-bar.tsx`)

Add a third `<Switch>` after the auto-approve toggle. Use a **blue** color theme with a map/document icon.

```tsx
{/* Plan Mode toggle */}
<div className="flex items-center gap-1.5">
  <Switch
    id="plan-mode-toggle"
    checked={settings.planMode}
    onCheckedChange={(checked) =>
      onSettingsChange({ ...settings, planMode: checked })
    }
    disabled={disabled}
    className="h-4 w-7 data-[state=checked]:bg-blue-500"
  />
  <Label
    htmlFor="plan-mode-toggle"
    className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground"
  >
    {/* Map/Plan icon */}
    <svg
      width="11" height="11"
      viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={settings.planMode ? "text-blue-500" : ""}
    >
      <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
    <span className={settings.planMode ? "text-blue-600 dark:text-blue-400" : ""}>
      Plan mode
    </span>
  </Label>
</div>
```

**Mutual exclusivity:** When plan mode is turned **on**, we automatically turn off `bypassPermissions` (plan mode requires read-only; bypassing permissions contradicts that). When plan mode is turned **off**, we do nothing special — the user can re-enable auto-approve manually.

```typescript
onCheckedChange={(checked) =>
  onSettingsChange({
    ...settings,
    planMode: checked,
    // Turning on plan mode disables auto-approve (they're mutually exclusive)
    bypassPermissions: checked ? false : settings.bypassPermissions,
  })
}
```

### Step 3 – Update `permissionMode` Derivation in All 4 Page Files

Replace the two-way `bypassPermissions → permissionMode` logic with a three-way check:

```typescript
// BEFORE
permissionMode: settings.bypassPermissions ? "bypassPermissions" : "default"

// AFTER
permissionMode: settings.planMode
  ? "plan"
  : settings.bypassPermissions
    ? "bypassPermissions"
    : "default"
```

This applies in all 4 page files:
- `app/chat/page.tsx`
- `app/chat/[sessionId]/page.tsx`
- `app/project/[slug]/chat/page.tsx`
- `app/project/[slug]/chat/[sessionId]/page.tsx`

### Step 4 – Expose `currentPermissionMode` from the stream hooks

So the UI can show the **actual** mode Claude is running in (from the `init` message), expose it from the hooks:

**`hooks/sdk-message-handler.ts`** — add a `setPermissionMode` callback parameter and call it when we receive the `init` system message:

```typescript
// In the system/init case:
if (sysMsg.subtype === "init") {
  setSessionId(sysMsg.session_id!);
  if (setPermissionMode && (sysMsg as any).permissionMode) {
    setPermissionMode((sysMsg as any).permissionMode);
  }
}
```

**`hooks/use-chat-stream.ts`** — add `currentPermissionMode` to the returned state:

```typescript
const [currentPermissionMode, setCurrentPermissionMode] =
  useState<string | null>(null);

// Pass setCurrentPermissionMode into handleSDKMessage
// Return it from the hook:
return {
  messages,
  send,
  stop,
  answerQuestion,
  isStreaming,
  sessionId,
  error,
  toolProgress,
  currentPermissionMode,  // NEW
};
```

### Step 5 – Optional: Show "Plan mode active" status indicator

If `currentPermissionMode === "plan"`, show a small blue banner above the chat input:

```tsx
{currentPermissionMode === "plan" && (
  <div className="mx-4 mb-1 rounded border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
    <MapIcon size={10} />
    Plan mode active — Claude will explore and propose a plan before making changes
  </div>
)}
```

---

## Interaction Design

| User action | Result |
|---|---|
| Toggle Plan Mode **ON** | `planMode: true`, `bypassPermissions: false` forced, `permissionMode: "plan"` sent to SDK |
| Toggle Plan Mode **OFF** | `planMode: false`, `bypassPermissions` reverts to whatever it was, `permissionMode: "default"` (or `"bypassPermissions"` if toggled back on) |
| Toggle Auto-approve while Plan mode is ON | Auto-approve toggle is disabled/ignored (can gray it out) while plan mode is active |
| Claude calls `ExitPlanMode` | The SDK handles this — Claude presents its plan for approval via the `ExitPlanMode` tool's built-in approval flow |

---

## What We're NOT Changing

- The backend (`procedures.ts`) — it already handles `"plan"` as a valid `permissionMode`.
- The `ChatStreamOpts` type — `"plan"` is already in the union.
- No new API routes, no new DB tables.

---

## Summary

**4 page files** get a one-liner update to the `permissionMode` ternary.
**1 component file** (`chat-settings-bar.tsx`) gets a new boolean in the type + a new toggle UI.
**2–3 hook files** get a `currentPermissionMode` state thread-through for status display.

Total estimated changes: ~60-80 lines across 7-8 files.
