"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useRef } from "react";

import { useWorkspace } from "@/lib/workspace-context";

// ── Inner component that reads search params ──────────────────────────────

function NewChatPageInner({ slug }: { slug: string }) {
  const { replaceNewSession } = useWorkspace();
  const searchParams = useSearchParams();
  const newKey = searchParams.get("_new") ?? "default";
  const handledKey = useRef<string | null>(null);

  useEffect(() => {
    if (handledKey.current === newKey) return;
    handledKey.current = newKey;
    replaceNewSession(slug);
  }, [newKey, slug, replaceNewSession]);

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
