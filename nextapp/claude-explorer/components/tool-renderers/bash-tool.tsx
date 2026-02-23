"use client";

import { useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import { str, type ToolRendererProps } from ".";

export function BashTool({
  input,
  output,
  is_error,
  elapsed,
  isRunning,
}: ToolRendererProps) {
  const [open, setOpen] = useState(false);
  const command = str(input.command);
  const description = input.description ? str(input.description) : null;

  return (
    <div className="my-1.5 rounded border border-border/50 bg-background/30 text-xs">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="shrink-0 text-muted-foreground">$</span>
        <code className="flex-1 truncate font-mono text-foreground">
          {command}
        </code>
        <StatusIndicator
          isRunning={isRunning}
          elapsed={elapsed}
          is_error={is_error}
          hasOutput={output !== undefined}
        />
      </div>
      {description && (
        <div className="border-t border-border/30 px-2.5 py-1 text-[10px] text-muted-foreground">
          {description}
        </div>
      )}
      {output !== undefined && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-1.5 border-t border-border/30 px-2.5 py-1 text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
            <span>{open ? "▼" : "▶"}</span>
            <span>Output</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre
              className={cn(
                "max-h-60 overflow-auto border-t border-border/30 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed",
                is_error ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {output.length > 3000
                ? output.slice(0, 3000) + "\n... (truncated)"
                : output}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

export function StatusIndicator({
  isRunning,
  elapsed,
  is_error,
  hasOutput,
}: {
  isRunning?: boolean;
  elapsed?: number;
  is_error?: boolean;
  hasOutput: boolean;
}) {
  if (isRunning) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-chart-1" />
        {elapsed !== undefined && formatElapsed(elapsed)}
      </span>
    );
  }
  if (!hasOutput) return null;
  if (is_error) {
    return <span className="text-[10px] text-destructive">error</span>;
  }
  return (
    <span className="text-[10px] text-muted-foreground">
      {elapsed !== undefined ? formatElapsed(elapsed) : "done"}
    </span>
  );
}

export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}
