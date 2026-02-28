"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, use } from "react";

import { OverviewTab } from "@/components/right-sidebar/overview-tab";

// ── Search-param reader ────────────────────────────────────────────────────────
// Reads `?commit=<hash>` and passes it to OverviewTab so the activity feed
// auto-expands that commit.  Must live inside a <Suspense> because
// useSearchParams() suspends during static rendering.

function OverviewPageInner({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const commitHash = searchParams.get("commit") ?? undefined;

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="border-b px-4 py-3">
        <h1 className="text-sm font-semibold">Overview</h1>
      </div>
      <OverviewTab
        slug={slug}
        commitMode="expand"
        initialCommitHash={commitHash}
      />
    </div>
  );
}

// ── Page export ────────────────────────────────────────────────────────────────

export default function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <Suspense>
      <OverviewPageInner slug={slug} />
    </Suspense>
  );
}
