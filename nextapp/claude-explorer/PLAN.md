# Bug Fix Plan: "New Conversation" Button Does Nothing

## Root Cause Analysis

### Bug 1 (Primary — what the user is hitting)
**Same-URL navigation is a silent no-op in Next.js**

The "New Conversation" button in `OverviewTab` (`components/right-sidebar/overview-tab.tsx`) links to `/project/{slug}/chat`. The user experiences "nothing happens" because:

- `/project/{slug}/chat/page.tsx` is the **blank new conversation page**
- After the user sends their **first message**, the stream starts and `sessionId` is set server-side, BUT the redirect to `/project/{slug}/chat/{sessionId}` only fires **after streaming completes** (`isStreaming === false`)
- So while Claude is **actively responding**, the URL is still `/project/{slug}/chat`
- Clicking "New Conversation" → links to `/project/{slug}/chat` → **same URL as current page** → Next.js silently skips navigation → **nothing happens**

This is also reproducible any time the user is at `/project/{slug}/chat` (e.g. the page immediately after clicking "New Conversation" the first time) and tries to click it again.

The code itself even comments this intent:
> "This keeps /project/[slug]/chat always a blank slate, so clicking '+ New' from a session page always hits a different URL"
— but this assumption breaks down the moment the user is *already* on `/project/{slug}/chat`.

### Bug 2 (Secondary — potential silent failure in some browsers)
**Invalid HTML: `<button>` nested inside `<a>`**

```tsx
// overview-tab.tsx — line 103-107
<Link href={`/project/${slug}/chat`}>
  <Button size="sm" className="w-full">
    New Conversation
  </Button>
</Link>
```

`<Link>` renders as `<a>`, and `<Button>` (via `@base-ui/react/button`) renders as `<button>`. Nesting `<button>` inside `<a>` is **invalid per the HTML spec** (interactive content cannot be descendant of `<a>`). Most modern browsers handle it gracefully, but it is fragile and can silently fail to fire the link, especially with custom UI primitives like Base UI which have their own pointer/keyboard event handling.

---

## The Fix

### Strategy
Instead of using a static `<Link>` that always points to `/project/{slug}/chat`, use an `onClick` handler with `router.push` that **always appends a changing `_new=<timestamp>` search param**. This:
1. Forces Next.js to treat it as a **different URL on every click** (solving the same-URL no-op)
2. Eliminates the `<a><button>` nesting (solving the invalid HTML issue)
3. The `_new` param acts as a **React key** to trigger a full remount of the chat component, resetting `useChatStream` state completely

### Files to Change

#### 1. `components/right-sidebar/overview-tab.tsx`
- Add `useRouter` import from `next/navigation`
- Remove `<Link>` wrapper around the button
- Add `onClick` handler that calls `router.push(`/project/${slug}/chat?_new=${Date.now()}`)`

```tsx
// Before
import Link from "next/link";
...
<div className="px-2">
  <Link href={`/project/${slug}/chat`}>
    <Button size="sm" className="w-full">
      New Conversation
    </Button>
  </Link>
</div>

// After
import { useRouter } from "next/navigation";
...
const router = useRouter();
...
<div className="px-2">
  <Button
    size="sm"
    className="w-full"
    onClick={() => router.push(`/project/${slug}/chat?_new=${Date.now()}`)}
  >
    New Conversation
  </Button>
</div>
```

#### 2. `app/project/[slug]/chat/page.tsx`
Split the component so `useSearchParams()` can be used to key off `_new` for forced remounts. This follows the same pattern used in `app/chat/page.tsx` (which already uses this Suspense + inner component approach).

```tsx
// After refactor:

"use client";

import { Suspense, use, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChatInput } from "@/components/chat-input";
import { ChatView } from "@/components/chat-view";
import { useChatStream } from "@/hooks/use-chat-stream";
import { orpc } from "@/lib/orpc";

// Inner component — keyed on `_new` so it fully remounts on each "New Conversation" click
function NewChatContent({ slug }: { slug: string }) {
  const router = useRouter();
  const { data } = useQuery(
    orpc.projects.resolveSlug.queryOptions({ input: { slug } })
  );
  const { messages, send, stop, isStreaming, sessionId, error, toolProgress } =
    useChatStream({ cwd: data?.path });

  const didRedirect = useRef(false);
  useEffect(() => {
    if (sessionId && !isStreaming && !didRedirect.current) {
      didRedirect.current = true;
      router.replace(`/project/${slug}/chat/${sessionId}`);
    }
  }, [sessionId, isStreaming, slug, router]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ChatView ... />
      {error && <div ...>{error}</div>}
      <ChatInput ... storageKey={`${slug}:new`} />
    </div>
  );
}

// Middle wrapper — reads `_new` param and uses it as key to force remount
function NewChatPageInner({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const newKey = searchParams.get("_new") ?? "initial";
  return <NewChatContent key={newKey} slug={slug} />;
}

// Root export — wraps in Suspense (required for useSearchParams in client components)
export default function NewChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <Suspense>
      <NewChatPageInner slug={slug} />
    </Suspense>
  );
}
```

---

## Why This Works

| Scenario | Before | After |
|---|---|---|
| At `/project/{slug}/chat/{sessionId}`, click "New Conversation" | ✅ Works (different URL) | ✅ Works (different URL + new `_new` param, component remounts) |
| At `/project/{slug}/chat` while streaming, click "New Conversation" | ❌ Same URL → nothing happens | ✅ `?_new=<timestamp>` changes → component remounts → fresh `useChatStream` state, streaming aborted |
| At `/project/{slug}/chat` (idle), click "New Conversation" again | ❌ Same URL → nothing happens | ✅ New timestamp → fresh blank canvas |
| HTML validity | ❌ `<a><button>` (invalid) | ✅ Plain `<button>` with `onClick` |

## No Breaking Changes
- The redirect logic (`router.replace('/project/{slug}/chat/${sessionId}')`) still fires correctly — it redirects to the session URL (which clears the `_new` param from the URL)
- The `storageKey` for chat input drafts is unchanged (`${slug}:new`)
- The sidebar behavior (staying on Overview tab, same project slug extraction) is unchanged
