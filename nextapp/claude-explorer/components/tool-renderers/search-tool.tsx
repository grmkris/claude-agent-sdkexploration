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
import { FilePreviewPopover } from "../file-preview-popover";
import { StatusIndicator } from "./bash-tool";

export function SearchTool({
  name,
  input,
  output,
  is_error,
  elapsed,
  isRunning,
  projectSlug,
}: ToolRendererProps) {
  const [open, setOpen] = useState(false);
  const pattern = str(input.pattern ?? input.query);
  const path = input.path ? str(input.path) : null;

  return (
    <div className="my-1.5 rounded border border-border/50 bg-background/30 text-xs">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <Badge
          variant="outline"
          className="shrink-0 text-[10px] font-mono px-1.5 py-0"
        >
          {name}
        </Badge>
        <code className="flex-1 truncate font-mono text-foreground">
          {pattern}
        </code>
        <StatusIndicator
          isRunning={isRunning}
          elapsed={elapsed}
          is_error={is_error}
          hasOutput={output !== undefined}
        />
      </div>
      {path && (
        <div className="border-t border-border/30 px-2.5 py-1 text-[10px] text-muted-foreground font-mono">
          in{" "}
          {projectSlug ? (
            <FilePreviewPopover filePath={path} projectSlug={projectSlug}>
              <span>{path}</span>
            </FilePreviewPopover>
          ) : (
            path
          )}
        </div>
      )}
      {output !== undefined && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-1.5 border-t border-border/30 px-2.5 py-1 text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
            <span>{open ? "▼" : "▶"}</span>
            <span>
              {output.trim().split("\n").length} match
              {output.trim().split("\n").length !== 1 ? "es" : ""}
            </span>
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
