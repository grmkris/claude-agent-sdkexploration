"use client";

import { use } from "react";

import { GitTab } from "@/components/right-sidebar/git-tab";

export default function ProjectGitPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="border-b px-4 py-3">
        <h1 className="text-sm font-semibold">Git</h1>
      </div>
      <GitTab slug={slug} />
    </div>
  );
}
