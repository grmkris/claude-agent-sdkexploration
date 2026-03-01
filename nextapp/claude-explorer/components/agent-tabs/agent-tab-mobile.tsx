"use client";

import { RightSidebarTrigger } from "@/components/ui/right-sidebar-trigger";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useActiveCount } from "@/hooks/use-active-count";
import { useCommandPalette } from "@/lib/command-palette-context";

export function AgentTabMobile() {
  const { setOpen: openCommandPalette } = useCommandPalette();
  const activeCount = useActiveCount();

  return (
    <div className="flex h-8 shrink-0 items-stretch border-b">
      {/* LEFT: left sidebar trigger (nav / project explorer) */}
      <div className="flex shrink-0 items-center gap-0.5 border-r border-border/50 px-1.5">
        <SidebarTrigger />
      </div>
      {/* CENTER: conversations trigger */}
      <button
        className="flex flex-1 items-center justify-center gap-1.5 px-3 text-xs text-muted-foreground"
        onClick={() => openCommandPalette(true)}
      >
        {activeCount > 0 ? (
          <>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <span>{activeCount} running</span>
          </>
        ) : (
          <span>Conversations</span>
        )}
      </button>
      {/* RIGHT: right sidebar trigger (recent sessions) */}
      <div className="flex shrink-0 items-center gap-0.5 border-l border-border/50 px-1.5">
        <RightSidebarTrigger />
      </div>
    </div>
  );
}
