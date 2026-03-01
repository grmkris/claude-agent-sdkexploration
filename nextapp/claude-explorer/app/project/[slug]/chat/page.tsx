"use client";

import { Suspense, use, useEffect, useRef } from "react";

import { useWorkspace } from "@/lib/workspace-context";

// ── Inner component that reads search params ──────────────────────────────

function NewChatPageInner({ slug }: { slug: string }) {
  const { replaceNewSession } = useWorkspace();
  const didOpen = useRef(false);

  useEffect(() => {
    if (didOpen.current) return;
    didOpen.current = true;
    // TODO: pass initialPrompt, initialChips, forkParams to the workspace panel
    replaceNewSession(slug);
  }, [slug, replaceNewSession]);

  return null;
}

// ── Page export ───────────────────────────────────────────────────────────

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
