# UI Redesign Plan

## Problem Summary

1. **Archive button** in `AgentTabBar` top-right corner gets accidentally clicked when reaching for the sidebar trigger.
2. **`ChatSettingsBar`** (Thinking / Auto-approve / Plan mode) uses plain switches with text labels — functional but not visually polished.

---

## Change 1 — Redesign `SessionFirstMessageBanner` into a `SessionHeaderBar`

**File:** `components/session-first-message-banner.tsx`

Transform the plain collapsible "STARTED WITH" text strip into a proper session header bar that has two zones:

```
[ ← back? ] [ first prompt text (truncated/expandable) ] [ ⚙ Archive | ··· ]
```

### What changes:
- Keep the existing first-prompt text (truncated, expandable on click) on the **left/center**
- Add an **Archive button** (the existing `<ArchiveChatButton>` logic, inlined or imported) on the **right side** of this bar
- Accept `sessionId` and `slug` props (already has them) — pass `projectSlug` for archive navigation too
- Remove `<ArchiveChatButton>` import from `AgentTabBar` and `AgentTabMobile`
- Remove `ArchiveChatButton` from the right slot of both tab bar files

### Props needed:
- `sessionId: string` ✅ already present
- `slug: string` ✅ already present  
- `projectSlug?: string | null` — new, needed so archive button knows where to navigate back to

The archive mutation logic (currently in `archive-chat-button.tsx`) can either be:
- **Option A:** Keep `ArchiveChatButton` as a standalone component and simply render it inside the banner's right slot
- **Option B:** Inline the archive logic into the banner

→ **Use Option A** (simpler, less duplication). The banner just renders `<ArchiveChatButton />` in its right slot — the component already reads `sessionId` from the URL via `usePathname()` so no extra props needed.

### New visual layout of the bar:
```
bg-muted/30, border-b, px-3 py-1.5, flex items-start gap-2

LEFT:  "STARTED WITH" label (10px uppercase muted)
MID:   first prompt text (truncated, flex-1)
RIGHT: [ArchiveChatButton h-6 w-6] [chevron expand/collapse icon]
```

The whole bar is still clickable to expand/collapse (via the text area click), but the right action buttons have `e.stopPropagation()` so they don't toggle expand.

---

## Change 2 — Remove `ArchiveChatButton` from the tab bars

**Files:**
- `components/agent-tabs/agent-tab-bar.tsx` — remove `<ArchiveChatButton />` from the right `<div>` slot (line ~319)
- `components/agent-tabs/agent-tab-mobile.tsx` — remove `<ArchiveChatButton />` from the right slot (line ~110)
- Remove the `ArchiveChatButton` import from both files

After removal, the right slot of `AgentTabBar` only contains:
```tsx
<div className="flex shrink-0 items-center gap-0.5 border-l border-border/50 px-1.5">
  <RightSidebarTrigger className="md:hidden" />
</div>
```
(On desktop the border-l div becomes empty — we can drop it entirely on desktop or keep just the trigger.)

---

## Change 3 — Redesign `ChatSettingsBar` into pill/chip toggles

**File:** `components/chat-settings-bar.tsx`

Replace the three `Switch + Label` rows with **compact segmented pill buttons** that look like mode chips. This makes the bar feel more intentional and less like an afterthought.

### New design concept:
```
┌─────────────────────────────────────────────────────────┐
│  [🧠 Thinking]  [✓ Auto-approve]  [📋 Plan mode]        │
│   (amber pill)   (green pill)       (blue pill)          │
└─────────────────────────────────────────────────────────┘
```

Each toggle is a **button-style chip** (not a Switch+Label pair):
- Inactive state: `bg-muted/50 text-muted-foreground border border-transparent rounded-full px-2.5 py-1 text-xs`
- Active state: colored bg + colored text, e.g.:
  - Thinking active: `bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30`
  - Auto-approve active: `bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30`
  - Plan mode active: `bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30`
- Disabled state: `opacity-40 cursor-not-allowed`
- Icon + text inside each chip (same icons as before, 11px)

The mutual-exclusion logic (plan mode disables auto-approve) stays exactly the same.

The "Plan mode active" info banner above the bar stays as-is (it's already nice).

### Implementation approach:
- Keep the same `ChatSettings` type, `DEFAULT_CHAT_SETTINGS`, and `ChatSettingsBar` props — **no API changes**
- Replace the `<Switch>` + `<Label>` for each toggle with a single `<button>` chip
- Remove the `Switch` import (no longer needed)
- Keep the `Label` import removal too since labels aren't needed for chip buttons

---

## File Change Summary

| File | Change |
|------|--------|
| `components/session-first-message-banner.tsx` | Add `<ArchiveChatButton />` to right slot; add stopPropagation on it |
| `components/agent-tabs/agent-tab-bar.tsx` | Remove `<ArchiveChatButton />` and its import |
| `components/agent-tabs/agent-tab-mobile.tsx` | Remove `<ArchiveChatButton />` and its import |
| `components/chat-settings-bar.tsx` | Replace Switch+Label toggles with pill chip buttons |

**No API changes, no schema changes, no new files needed.**

---

## Order of Implementation

1. `chat-settings-bar.tsx` — pill redesign (self-contained, no dependencies)
2. `session-first-message-banner.tsx` — add archive button to right slot
3. `agent-tab-bar.tsx` — remove archive button + import
4. `agent-tab-mobile.tsx` — remove archive button + import
