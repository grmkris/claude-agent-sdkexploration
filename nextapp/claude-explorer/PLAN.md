# Prompt Store Feature Plan

## Overview
Add a **Prompt Store** to the chat input toolbar — a button that opens a popover where users can save, manage, and insert reusable prompt templates. Prompts are persisted server-side in `~/.claude/explorer.json`.

---

## Architecture

### Data Model
A `SavedPrompt` object:
```ts
{
  id: string;           // crypto.randomUUID()
  title: string;        // short label shown in the list
  body: string;         // the full prompt text
  createdAt: string;    // ISO timestamp
}
```

---

## Files to Create / Modify

### 1. `lib/types.ts` — add `SavedPrompt` type + re-export
Add a `SavedPrompt` type and re-export it from the barrel.

### 2. `lib/explorer-store.ts` — add store helpers
- Add `savedPrompts: SavedPrompt[]` to the `EMPTY_STORE` constant
- Add helper functions: `getPrompts()`, `addPrompt(p)`, `updatePrompt(id, patch)`, `deletePrompt(id)` — following the same pattern as `getFavorites`, `getCrons`, etc.

### 3. `lib/schemas.ts` — add `SavedPromptSchema`
```ts
export const SavedPromptSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
});
```

### 4. `lib/procedures.ts` — add oRPC procedures + router entry
Four new procedures:
- `listPromptsProc` — no input, output: `z.array(SavedPromptSchema)`, handler: `getPrompts()`
- `createPromptProc` — input: `{ title: z.string(), body: z.string() }`, output: `SavedPromptSchema`, handler: `addPrompt()`
- `updatePromptProc` — input: `{ id: z.string(), title?: z.string(), body?: z.string() }`, output: `SavedPromptSchema`, handler: `updatePrompt()`
- `deletePromptProc` — input: `{ id: z.string() }`, output: `{ success: z.boolean() }`, handler: `deletePrompt()`

Add to the router:
```ts
promptStore: {
  list: listPromptsProc,
  create: createPromptProc,
  update: updatePromptProc,
  delete: deletePromptProc,
}
```

### 5. `components/prompt-store-popover.tsx` — new component
A self-contained popover component with two states:

**List view** (default):
- Header: "Saved Prompts" + "New" button
- Scrollable list; each row shows title + truncated body preview + "Use" (insert) + pencil (edit) + trash (delete) actions
- Empty state message: "No saved prompts yet."

**Create/Edit view**:
- Back arrow → returns to list
- Title `<input>` + body `<textarea>`
- "Save" button (disabled until both fields filled)
- Uses `orpc.promptStore.create.useMutation()` / `orpc.promptStore.update.useMutation()`

**Props:**
```ts
{ onInsert: (body: string) => void }
```

The trigger button uses `BookmarkIcon` from `@hugeicons/core-free-icons`.
The popover opens with `side="top"`, `align="start"`, `className="w-80"`.
Uses `Popover`/`PopoverTrigger`/`PopoverContent` from `@/components/ui/popover` and `Button` from `@/components/ui/button`.
Queries/mutations via `orpc` from `@/lib/orpc`.

### 6. `components/chat-input.tsx` — integrate the button
- Import `PromptStorePopover`
- Place it in the left toolbar, between the attachment button and the mic button
- Pass:
  ```tsx
  onInsert={(body) => {
    setValue(body);
    requestAnimationFrame(() => {
      autoGrow();
      textareaRef.current?.focus();
    });
  }}
  ```

---

## UI Layout After Change
```
[ 📎 ] [ 📚 ] [ 🎤 ] [ textarea...                    ] [ ▶ ]
  ^attach  ^prompts  ^mic
```

---

## Implementation Order
1. `lib/types.ts` — add `SavedPrompt` type + re-export
2. `lib/explorer-store.ts` — add `savedPrompts` to EMPTY_STORE + CRUD helpers
3. `lib/schemas.ts` — add `SavedPromptSchema`
4. `lib/procedures.ts` — add 4 procedures + router entry
5. `components/prompt-store-popover.tsx` — create new component
6. `components/chat-input.tsx` — integrate button + popover
