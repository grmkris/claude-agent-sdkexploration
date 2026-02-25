"use client";

import { SidebarRightIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useRightSidebar } from "@/components/ui/right-sidebar-context";
import { cn } from "@/lib/utils";

function RightSidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useRightSidebar();
  const pathname = usePathname();

  // Hide trigger on root view — right sidebar only shows in project context
  if (!pathname.startsWith("/project/")) return null;

  return (
    <Button
      data-sidebar="right-trigger"
      data-slot="right-sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <HugeiconsIcon icon={SidebarRightIcon} strokeWidth={2} />
      <span className="sr-only">Toggle Right Sidebar</span>
    </Button>
  );
}

export { RightSidebarTrigger };
