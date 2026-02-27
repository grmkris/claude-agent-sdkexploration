"use client";

import { use } from "react";

import { SkillsMcpsTab } from "@/components/right-sidebar/skills-mcps-tab";

export default function ProjectSkillsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="border-b px-4 py-3">
        <h1 className="text-sm font-semibold">Skills &amp; MCPs</h1>
      </div>
      <SkillsMcpsTab slug={slug} />
    </div>
  );
}
