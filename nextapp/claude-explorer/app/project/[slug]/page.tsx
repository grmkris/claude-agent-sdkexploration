"use client";

import Link from "next/link";
import { use } from "react";

import { SessionList } from "@/components/session-list";
import { Button } from "@/components/ui/button";

// All project config sections (Skills, Integrations, Tmux, Files, CLAUDE.md,
// Crons, Webhooks) live in the left sidebar (explorer-sidebar-sections.tsx).
// This page focuses solely on the session list.

export default function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  return (
    <div className="flex flex-1 flex-col overflow-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">Conversations</span>
        <Link href={`/project/${slug}/chat`}>
          <Button size="sm">+ New Conversation</Button>
        </Link>
      </div>
      <SessionList projectSlug={slug} />
    </div>
  );
}
