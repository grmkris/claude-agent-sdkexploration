"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import type { ToolRendererProps } from ".";

import { parseMcpToolName } from ".";
import { StatusIndicator } from "./bash-tool";

export function GenericTool({
  name,
  input,
  output,
  is_error,
  elapsed,
  isRunning,
  mcpServer,
}: ToolRendererProps) {
  const [open, setOpen] = useState(false);
  const displayName = parseMcpToolName(name).tool;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-1.5">
      <CollapsibleTrigger className="flex w-full items-center gap-2 text-xs cursor-pointer hover:opacity-80">
        <span className="text-[10px]">{open ? "▼" : "▶"}</span>
        <Badge variant="outline" className="text-[10px] font-mono">
          {mcpServer && (
            <span className="text-muted-foreground">{mcpServer}/</span>
          )}
          {displayName}
        </Badge>
        <StatusIndicator
          isRunning={isRunning}
          elapsed={elapsed}
          is_error={is_error}
          hasOutput={output !== undefined}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 overflow-x-auto rounded bg-background/50 p-2 text-[11px] font-mono leading-relaxed">
          {JSON.stringify(input, null, 2)}
        </pre>
        {output !== undefined && (
          <pre
            className={cn(
              "mt-1 max-h-60 overflow-auto rounded p-2 text-[11px] font-mono leading-relaxed",
              is_error
                ? "bg-destructive/10 text-destructive"
                : "bg-background/30"
            )}
          >
            {output.length > 2000
              ? output.slice(0, 2000) + "\n... (truncated)"
              : output}
          </pre>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
