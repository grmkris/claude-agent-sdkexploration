# Plan: Add Model Selector to ChatSettingsBar

## Overview

Add a model dropdown to the `ChatSettingsBar` component (the row with Thinking / Auto-approve / Plan mode chips), sitting inline at the right end of the chips row. The selected model flows through the settings object all the way to the server, replacing the two hardcoded `"claude-sonnet-4-6"` strings.

---

## Architecture (current state)

```
Page (4 pages: /chat, /chat/[id], /project/[slug]/chat, /project/[slug]/chat/[id])
  └─ useState<ChatSettings>  { thinkingEnabled, bypassPermissions, planMode }
       ├─ <ChatSettingsBar>     renders the chips row
       └─ useRootChatStream / useChatStream  →  client.rootChat / client.chat  →  procedures.ts
                                                                                    model: "claude-sonnet-4-6" (hardcoded x2)
```

---

## UI Placement

The model selector goes at the **right end** of the existing chips row, after Plan mode:

```
[ 🧠 Thinking ]  [ ✓ Auto-approve ]  [ 📋 Plan mode ]          [ Sonnet 4.6 ▾ ]
```

It uses the existing shadcn `<Select>` component (already used in `tmux-launcher.tsx`) styled compactly to fit the settings bar aesthetic.

---

## Files to Change (8 files)

### 1. `components/chat-settings-bar.tsx`
- Add `model: string` to the `ChatSettings` type.
- Update `DEFAULT_CHAT_SETTINGS` to default to `"claude-sonnet-4-6"`.
- Export a `MODELS` constant:
  ```ts
  export const MODELS = [
    { value: "claude-opus-4-5",   label: "Opus 4.5" },
    { value: "claude-sonnet-4-5", label: "Sonnet 4.5" },
    { value: "claude-haiku-4-5",  label: "Haiku 4.5" },
    { value: "claude-opus-4-6",   label: "Opus 4.6" },
    { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
    { value: "claude-haiku-4-6",  label: "Haiku 4.6" },
  ] as const;
  ```
- Import `Select / SelectContent / SelectItem / SelectTrigger / SelectValue` from `@/components/ui/select`.
- Render a compact `<Select>` at the right end of the chips row (with `ml-auto`), showing the short label (e.g. "Sonnet 4.6").
- Style the trigger as a small rounded pill to match the rest of the bar.

### 2. `hooks/use-root-chat-stream.ts`
- Add `model?: string` to `RootChatStreamOpts`.
- Spread `model: opts?.model` into the `client.rootChat(...)` call.
- Add `opts?.model` to the `useCallback` dependency array.

### 3. `hooks/use-chat-stream.ts`
- Same change for `ChatStreamOpts` / `client.chat(...)`.

### 4. `lib/procedures.ts`
- Add `model: z.string().optional()` to the input schema of **both** `chatProc` and `rootChatProc`.
- Replace `model: "claude-sonnet-4-6"` with `model: input.model ?? "claude-sonnet-4-6"` in both handlers.

### 5–8. All four page files
Add `model: settings.model` to the hook options:

| Page | Hook |
|------|------|
| `app/chat/page.tsx` | `useRootChatStream` |
| `app/chat/[sessionId]/page.tsx` | `useRootChatStream` |
| `app/project/[slug]/chat/page.tsx` | `useChatStream` |
| `app/project/[slug]/chat/[sessionId]/page.tsx` | `useChatStream` |

---

## What Does NOT Change
- `ChatInput` component — no changes needed.
- `ContextBar` read-only model display — already reads from the session record, which is populated by the server and will show the correct model automatically.
- The tmux launcher model list — independent, generates CLI commands only.
- The linear chat executor — out of scope.

---

## Order of Implementation

1. `lib/procedures.ts` — add `model` input + use it (server-side, self-contained)
2. `components/chat-settings-bar.tsx` — extend type + add UI dropdown
3. `hooks/use-root-chat-stream.ts` — thread model through
4. `hooks/use-chat-stream.ts` — thread model through
5. All four page files — pass `settings.model` to hooks
