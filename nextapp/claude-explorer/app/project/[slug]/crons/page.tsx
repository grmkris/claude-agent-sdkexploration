"use client";

import { use } from "react";

import { CronsContent } from "@/components/crons-content";

export default function ProjectCronsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <CronsContent projectSlug={slug} />
    </div>
  );
}
