"use client";

import { Suspense, useEffect, useRef } from "react";

import { useWorkspace } from "@/lib/workspace-context";

// ── Inner component ──────────────────────────────────────────────────────

function RootNewChatPageInner() {
  const { openNewSession } = useWorkspace();
  const didOpen = useRef(false);

  useEffect(() => {
    if (didOpen.current) return;
    didOpen.current = true;
    // TODO: pass forkParams through to the workspace panel
    openNewSession(); // root session (no project slug)
  }, [openNewSession]);

  return null;
}

// ── Page export ───────────────────────────────────────────────────────────

export default function RootNewChatPage() {
  return (
    <Suspense>
      <RootNewChatPageInner />
    </Suspense>
  );
}
