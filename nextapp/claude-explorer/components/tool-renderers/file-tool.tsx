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
import { buildEditDiff, DiffView } from "../diff-view";
import { FilePreviewPopover } from "../file-preview-popover";
import { StatusIndicator } from "./bash-tool";

function EditDiff({
  oldString,
  newString,
  filePath,
}: {
  oldString: string;
  newString: string;
  filePath?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const diff = buildEditDiff(oldString, newString, filePath);
  const lineCount = diff.split("\n").length;
  const COLLAPSE_THRESHOLD = 20;

  if (!diff) return null;

  if (lineCount <= COLLAPSE_THRESHOLD) {
    return (
      <div className="border-t border-border/30 px-2.5 py-1.5">
        <DiffView diff={diff} />
      </div>
    );
  }

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 border-t border-border/30 px-2.5 py-1 text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
        <span>{expanded ? "▼" : "▶"}</span>
        <span>Diff</span>
        <span className="ml-auto">
          {(() => {
            const delta =
              newString.split("\n").length - oldString.split("\n").length;
            return (
              <span className={delta >= 0 ? "text-green-400" : "text-red-400"}>
                {delta >= 0 ? `+${delta}` : delta} lines
              </span>
            );
          })()}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border/30 px-2.5 py-1.5">
          <DiffView diff={diff} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function WriteDiff({
  content,
  filePath,
}: {
  content: string;
  filePath?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const lineCount = content.split("\n").length;
  const diff = buildEditDiff("", content, filePath);

  if (!diff) return null;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 border-t border-border/30 px-2.5 py-1 text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
        <span>{expanded ? "▼" : "▶"}</span>
        <span>Content</span>
        <span className="ml-auto text-green-400">+{lineCount} lines</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="max-h-60 overflow-auto border-t border-border/30 px-2.5 py-1.5">
          <DiffView diff={diff} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

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
        <EditDiff
          oldString={str(input.old_string)}
          newString={str(input.new_string)}
          filePath={filePath}
        />
      )}

      {name === "Write" && !!input.content && (
        <WriteDiff content={str(input.content)} filePath={filePath} />
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
