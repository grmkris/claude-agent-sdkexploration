"use client";

import { use, useEffect } from "react";

import { useWorkspace } from "@/lib/workspace-context";

export default function RootSessionChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const { replaceSession } = useWorkspace();

  useEffect(() => {
    replaceSession(sessionId);
  }, [sessionId, replaceSession]);

  // Workspace component handles rendering via panels
  return null;
}
