"use client"

import { useState } from "react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Badge } from "@/components/ui/badge"

export function ToolUseBlock({
  name,
  input,
}: {
  name: string
  input: Record<string, unknown>
}) {
  const [open, setOpen] = useState(false)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-1">
      <CollapsibleTrigger className="flex items-center gap-2 text-xs cursor-pointer hover:opacity-80">
        <span className="text-[10px]">{open ? "▼" : "▶"}</span>
        <Badge variant="outline" className="text-[10px] font-mono">
          {name}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 overflow-x-auto rounded bg-background/50 p-2 text-[11px] font-mono leading-relaxed">
          {JSON.stringify(input, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}
