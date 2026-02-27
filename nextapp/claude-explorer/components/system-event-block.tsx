"use client";

import { useState } from "react";

import type {
  SystemEventBlock as SystemEventBlockType,
  ToolUseSummaryBlock as ToolUseSummaryBlockType,
} from "@/lib/types";

function linkify(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-blue-400 hover:text-blue-300"
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

export function SystemEventBlock({ block }: { block: SystemEventBlockType }) {
  const [showDetail, setShowDetail] = useState(false);

  const icon = eventIcon(block.subtype);
  const isAuth = block.subtype === "auth_status";

  return (
    <div className="flex justify-center py-0.5">
      <button
        onClick={() => block.detail && setShowDetail(!showDetail)}
        className="max-w-[80%] text-center text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-default"
        style={{ cursor: block.detail ? "pointer" : "default" }}
      >
        <span>
          {icon} {isAuth ? linkify(block.message) : block.message}
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

export function ToolUseSummaryGroup({
  blocks,
}: {
  blocks: ToolUseSummaryBlockType[];
}) {
  const [open, setOpen] = useState(false);

  const names = [...new Set(blocks.map((b) => b.toolName))];
  const namesSummary =
    names.length <= 3 ? names.join(", ") : names.slice(0, 3).join(", ") + "...";

  return (
    <div className="flex justify-center py-0.5">
      <div className="w-full max-w-[80%]">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <span>{open ? "▼" : "▶"}</span>
          <span>
            {blocks.length} tool call{blocks.length !== 1 ? "s" : ""}: {namesSummary}
          </span>
        </button>
        {open && (
          <div className="mt-0.5 flex flex-col items-center gap-0">
            {blocks.map((block, i) => (
              <span key={i} className="text-[10px] text-muted-foreground/70">
                {block.toolName}
                {block.filepath && (
                  <span className="font-mono"> {block.filepath.split("/").pop()}</span>
                )}
                {block.summary && <span> - {block.summary}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
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
    case "auth_status":
      return "!";
    default:
      return "-";
  }
}
