"use client";

import { use } from "react";

import { TerminalContent } from "@/components/terminal/terminal-content";

export default function ProjectTerminalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TerminalContent projectSlug={slug} />
    </div>
  );
}
