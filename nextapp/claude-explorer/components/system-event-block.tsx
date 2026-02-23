"use client";

import { useState } from "react";

import type {
  SystemEventBlock as SystemEventBlockType,
  ToolUseSummaryBlock as ToolUseSummaryBlockType,
} from "@/lib/types";

export function SystemEventBlock({ block }: { block: SystemEventBlockType }) {
  const [showDetail, setShowDetail] = useState(false);

  const icon = eventIcon(block.subtype);

  return (
    <div className="flex justify-center py-0.5">
      <button
        onClick={() => block.detail && setShowDetail(!showDetail)}
        className="max-w-[80%] text-center text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-default"
        style={{ cursor: block.detail ? "pointer" : "default" }}
      >
        <span>
          {icon} {block.message}
        </span>
        {showDetail && block.detail && (
          <div className="mt-0.5 font-mono text-[9px] text-muted-foreground/70">
            {block.detail}
          </div>
        )}
      </button>
    </div>
  );
}

export function ToolUseSummaryBlock({
  block,
}: {
  block: ToolUseSummaryBlockType;
}) {
  return (
    <div className="flex justify-center py-0.5">
      <span className="text-[10px] text-muted-foreground">
        {block.toolName}
        {block.filepath && (
          <span className="font-mono"> {block.filepath.split("/").pop()}</span>
        )}
        {block.summary && <span> - {block.summary}</span>}
      </span>
    </div>
  );
}

function eventIcon(subtype: string): string {
  switch (subtype) {
    case "compact_boundary":
      return "~";
    case "status":
      return "-";
    case "hook_started":
    case "hook_progress":
    case "hook_response":
      return ">";
    case "task_started":
    case "task_notification":
      return "*";
    default:
      return "-";
  }
}
