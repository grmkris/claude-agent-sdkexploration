"use client";

import { use } from "react";

import { SessionList } from "@/components/session-list";

// All project config sections (Skills, Integrations, Tmux, Files, CLAUDE.md,
// Crons, Webhooks) have moved to the left sidebar via ProjectContextSection.
// This page now focuses solely on the session list.

export default function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  return (
    <div className="flex flex-1 flex-col overflow-auto p-4">
      <SessionList projectSlug={slug} />
    </div>
  );
}
