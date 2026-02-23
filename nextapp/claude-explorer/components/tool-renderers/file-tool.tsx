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

export function FileTool({
  name,
  input,
  output,
  is_error,
  elapsed,
  isRunning,
  projectSlug,
}: ToolRendererProps) {
  const [open, setOpen] = useState(false);
  const filePath = str(input.file_path ?? input.notebook_path ?? input.pattern);
  const shortPath = filePath.split("/").slice(-3).join("/");

  const pathElement = (
    <code
      className="flex-1 truncate font-mono text-foreground"
      title={filePath}
    >
      {shortPath}
    </code>
  );

  return (
    <div className="my-1.5 rounded border border-border/50 bg-background/30 text-xs">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <Badge
          variant="outline"
          className="shrink-0 text-[10px] font-mono px-1.5 py-0"
        >
          {name}
        </Badge>
        {projectSlug ? (
          <FilePreviewPopover filePath={filePath} projectSlug={projectSlug}>
            {pathElement}
          </FilePreviewPopover>
        ) : (
          pathElement
        )}
        <StatusIndicator
          isRunning={isRunning}
          elapsed={elapsed}
          is_error={is_error}
          hasOutput={output !== undefined}
        />
      </div>

      {name === "Edit" && !!input.old_string && (
        <div className="border-t border-border/30 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed">
          <div className="text-red-400/80">
            {str(input.old_string)
              .split("\n")
              .slice(0, 8)
              .map((line, i) => (
                <div key={i}>- {line}</div>
              ))}
            {str(input.old_string).split("\n").length > 8 && (
              <div className="text-muted-foreground">
                ... ({str(input.old_string).split("\n").length} lines)
              </div>
            )}
          </div>
          <div className="mt-1 text-green-400/80">
            {str(input.new_string)
              .split("\n")
              .slice(0, 8)
              .map((line, i) => (
                <div key={i}>+ {line}</div>
              ))}
            {str(input.new_string).split("\n").length > 8 && (
              <div className="text-muted-foreground">
                ... ({str(input.new_string).split("\n").length} lines)
              </div>
            )}
          </div>
        </div>
      )}

      {name === "Write" && !!input.content && (
        <div className="border-t border-border/30 px-2.5 py-1 text-[10px] text-muted-foreground">
          {str(input.content).split("\n").length} lines written
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
