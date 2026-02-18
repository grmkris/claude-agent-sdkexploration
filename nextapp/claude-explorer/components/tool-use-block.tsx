"use client"

import { useState } from "react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function ToolUseBlock({
  name,
  input,
  output,
  is_error,
}: {
  name: string
  input: Record<string, unknown>
  output?: string
  is_error?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-1">
      <CollapsibleTrigger className="flex items-center gap-2 text-xs cursor-pointer hover:opacity-80">
        <span className="text-[10px]">{open ? "▼" : "▶"}</span>
        <Badge variant="outline" className="text-[10px] font-mono">
          {name}
        </Badge>
        {output !== undefined && (
          <span className={cn("text-[10px]", is_error ? "text-destructive" : "text-muted-foreground")}>
            {is_error ? "error" : "done"}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 overflow-x-auto rounded bg-background/50 p-2 text-[11px] font-mono leading-relaxed">
          {JSON.stringify(input, null, 2)}
        </pre>
        {output !== undefined && (
          <pre
            className={cn(
              "mt-1 max-h-60 overflow-auto rounded p-2 text-[11px] font-mono leading-relaxed",
              is_error ? "bg-destructive/10 text-destructive" : "bg-background/30"
            )}
          >
            {output.length > 2000 ? output.slice(0, 2000) + "\n... (truncated)" : output}
          </pre>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
