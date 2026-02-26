"use client";

import { useQuery } from "@tanstack/react-query";

import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

export function WorktreeInfoSection({ slug }: { slug: string }) {
  const { data: worktrees } = useQuery(
    orpc.projects.gitWorktrees.queryOptions({ input: { slug } })
  );

  // Only render when there are 2+ worktrees
  if (!worktrees || worktrees.length < 2) return null;

  return (
    <SidebarGroup>
      <div className="px-2 pb-1 text-[11px] font-medium text-sidebar-foreground/70">
        Git Worktrees
      </div>
      <SidebarGroupContent>
        <div className="flex flex-col gap-0.5 px-2">
          {worktrees.map((wt) => (
            <div key={wt.path} className="flex items-center gap-2 py-0.5 text-xs">
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  wt.isCurrent ? "bg-green-400" : "bg-muted-foreground/30"
                )}
              />
              <span className="flex-1 truncate font-mono text-[10px]">
                {wt.branch}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
                {wt.head.slice(0, 7)}
              </span>
            </div>
          ))}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
