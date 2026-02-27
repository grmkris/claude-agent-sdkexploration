"use client";

import { use } from "react";

import { ActivityFeed } from "@/components/activity-feed";

export default function ProjectActivityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b px-4 py-3">
        <h1 className="text-sm font-semibold">Activity</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Commits, deployments, and tickets — all in one place
        </p>
      </div>
      <ActivityFeed slug={slug} />
    </div>
  );
}
