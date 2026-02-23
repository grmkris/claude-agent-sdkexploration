"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import { str, type ToolRendererProps } from ".";
import { StatusIndicator } from "./bash-tool";

export function TaskTool({
  input,
  output,
  is_error,
  elapsed,
  isRunning,
}: ToolRendererProps) {
  const [open, setOpen] = useState(false);
  const description = input.description ? str(input.description) : null;
  const subagentType = input.subagent_type ? str(input.subagent_type) : null;

  return (
    <div className="my-1.5 rounded border border-border/50 bg-background/30 text-xs">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <Badge
          variant="outline"
          className="shrink-0 text-[10px] font-mono px-1.5 py-0"
        >
          Task
        </Badge>
        {subagentType && (
          <Badge
            variant="secondary"
            className="shrink-0 text-[10px] px-1.5 py-0"
          >
            {subagentType}
          </Badge>
        )}
        {description && (
          <span className="flex-1 truncate text-foreground">{description}</span>
        )}
        <StatusIndicator
          isRunning={isRunning}
          elapsed={elapsed}
          is_error={is_error}
          hasOutput={output !== undefined}
        />
      </div>
      {output !== undefined && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-1.5 border-t border-border/30 px-2.5 py-1 text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
            <span>{open ? "▼" : "▶"}</span>
            <span>Result</span>
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
