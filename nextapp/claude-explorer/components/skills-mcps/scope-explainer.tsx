"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

const SCOPES = [
  {
    name: "User",
    key: "user",
    description:
      "Available in all your projects. Stored globally in your user config.",
  },
  {
    name: "Local",
    key: "local",
    description:
      "Available only in this project, for you. Not committed to git.",
  },
  {
    name: "Project",
    key: "project",
    description:
      "Shared with everyone who clones this project. Stored in .mcp.json.",
  },
] as const;

export function ScopeExplainer({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("text-[11px]", className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? "Hide scope info" : "What are scopes?"}
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col gap-1.5 rounded border bg-muted/20 p-2">
          {SCOPES.map((s) => (
            <div key={s.key}>
              <span className="font-medium text-foreground">{s.name}</span>
              <span className="text-muted-foreground"> — {s.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
