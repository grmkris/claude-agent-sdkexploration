"use client";

import { use } from "react";

import { OverviewTab } from "@/components/right-sidebar/overview-tab";

export default function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="border-b px-4 py-3">
        <h1 className="text-sm font-semibold">Overview</h1>
      </div>
      <OverviewTab slug={slug} />
    </div>
  );
}
