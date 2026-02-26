"use client";

import { TmuxSessionsPanel } from "@/components/tmux-sessions-panel";

export default function TmuxPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-4 text-lg font-semibold">Tmux Sessions</h1>
      <TmuxSessionsPanel />
    </main>
  );
}
