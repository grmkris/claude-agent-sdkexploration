"use client";

import { use } from "react";

import { FileTreeTab } from "@/components/right-sidebar/file-tree-tab";

export default function ProjectFilesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="border-b px-4 py-3">
        <h1 className="text-sm font-semibold">Files</h1>
      </div>
      <FileTreeTab slug={slug} />
    </div>
  );
}
