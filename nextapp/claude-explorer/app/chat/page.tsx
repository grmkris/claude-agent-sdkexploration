"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { useWorkspace } from "@/lib/workspace-context";

// ── Inner component ──────────────────────────────────────────────────────

function RootNewChatPageInner() {
  const { replaceNewSession } = useWorkspace();
  const searchParams = useSearchParams();
  const newKey = searchParams.get("_new") ?? "default";
  const handledKey = useRef<string | null>(null);

  useEffect(() => {
    if (handledKey.current === newKey) return;
    handledKey.current = newKey;
    replaceNewSession(); // root session (no project slug)
  }, [newKey, replaceNewSession]);

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
