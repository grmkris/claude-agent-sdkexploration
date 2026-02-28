"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SCOPE_CONFIG = {
  user: { label: "User", variant: "secondary" as const },
  local: { label: "Local", variant: "outline" as const },
  project: { label: "Project", variant: "default" as const },
} as const;

export function ScopeBadge({
  scope,
  className,
}: {
  scope: "user" | "local" | "project";
  className?: string;
}) {
  const config = SCOPE_CONFIG[scope];
  return (
    <Badge variant={config.variant} className={cn("text-[10px]", className)}>
      {config.label}
    </Badge>
  );
}
