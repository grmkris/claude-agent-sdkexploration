"use client";

import { use } from "react";

import { AutomationsTab } from "@/components/right-sidebar/automations-tab";

export default function ProjectAutomationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="border-b px-4 py-3">
        <h1 className="text-sm font-semibold">Automations</h1>
      </div>
      <AutomationsTab slug={slug} />
    </div>
  );
}
