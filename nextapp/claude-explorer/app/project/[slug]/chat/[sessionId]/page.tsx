"use client";

import { use, useEffect } from "react";

import { useWorkspace } from "@/lib/workspace-context";

export default function SessionChatPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}) {
  const { slug, sessionId } = use(params);
  const { replaceSession } = useWorkspace();

  useEffect(() => {
    replaceSession(sessionId, slug);
  }, [sessionId, slug, replaceSession]);

  // Workspace component handles rendering via panels
  return null;
}
