"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export function ToolInspectionPanel({
  tools,
  error,
  compact = false,
}: {
  tools: McpTool[];
  error?: string;
  compact?: boolean;
}) {
  const [expandedSchema, setExpandedSchema] = useState<string | null>(null);

  if (error) {
    return (
      <div
        className={cn(
          "rounded border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400",
          !compact && "ml-4"
        )}
      >
        {error}
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <div
        className={cn("py-2 text-xs text-muted-foreground", !compact && "ml-4")}
      >
        No tools found.
      </div>
    );
  }

  return (
    <div
      className={cn("rounded border bg-muted/20 px-3 py-2", !compact && "ml-4")}
    >
      <div className="mb-1 text-[10px] font-medium text-muted-foreground">
        {tools.length} tool{tools.length !== 1 ? "s" : ""}
      </div>
      <div className="flex flex-col gap-1">
        {tools.map((t) => (
          <div key={t.name}>
            <div className="flex items-start gap-2">
              <button
                onClick={() =>
                  setExpandedSchema(expandedSchema === t.name ? null : t.name)
                }
                className="font-mono text-xs text-foreground hover:underline"
              >
                {t.name}
              </button>
              {t.description && (
                <span className="text-[10px] text-muted-foreground leading-relaxed">
                  {t.description}
                </span>
              )}
            </div>
            {expandedSchema === t.name && !!t.inputSchema && (
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/30 p-2 text-[10px] text-muted-foreground">
                {JSON.stringify(t.inputSchema, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
