"use client";

import { usePathname, useRouter } from "next/navigation";

import { SessionsPanel } from "@/components/sessions-panel";
import { Button } from "@/components/ui/button";
import { useRightSidebar } from "@/components/ui/right-sidebar-context";
import { RightSidebarTrigger } from "@/components/ui/right-sidebar-trigger";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
} from "@/components/ui/sidebar";

const RIGHT_SIDEBAR_WIDTH = "17rem";
const RIGHT_SIDEBAR_WIDTH_MOBILE = "18rem";

/** Extract project slug from paths like /project/[slug] or /project/[slug]/… */
function extractSlug(pathname: string): string | null {
  const match = pathname.match(/^\/project\/([^/]+)/);
  return match ? match[1] : null;
}

function RightSidebarInner() {
  const pathname = usePathname();
  const router = useRouter();
  const activeSlug = extractSlug(pathname);
  const label = activeSlug ? "This project" : "All projects";

  return (
    <div className="bg-sidebar flex size-full flex-col">
      <SidebarHeader className="border-b px-2 py-0">
        <div className="flex h-9 items-center gap-1.5">
          <RightSidebarTrigger className="-ml-0.5 shrink-0" />
          <span className="flex-1 text-sm font-semibold">Sessions</span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 px-2 text-xs"
            onClick={() =>
              activeSlug
                ? router.push(`/project/${activeSlug}/chat?_new=${Date.now()}`)
                : router.push("/chat")
            }
          >
            New Conversation
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{label}</SidebarGroupLabel>
          <SessionsPanel
            filterSlug={activeSlug ?? undefined}
            showProjectLabel={!activeSlug}
          />
        </SidebarGroup>
      </SidebarContent>
    </div>
  );
}

export function RightSidebar() {
  const { state, openMobile, setOpenMobile, isMobile } = useRightSidebar();

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="right"
          data-sidebar="right-sidebar"
          className="bg-sidebar text-sidebar-foreground p-0 [&>button]:hidden"
          style={
            {
              "--sidebar-width": RIGHT_SIDEBAR_WIDTH_MOBILE,
              width: RIGHT_SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sessions</SheetTitle>
            <SheetDescription>
              Recent sessions across all projects.
            </SheetDescription>
          </SheetHeader>
          <RightSidebarInner />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="group peer text-sidebar-foreground hidden md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? "offcanvas" : ""}
      data-variant="sidebar"
      data-side="right"
      style={{ "--sidebar-width": RIGHT_SIDEBAR_WIDTH } as React.CSSProperties}
    >
      {/* Gap placeholder — shrinks to 0 when offcanvas */}
      <div className="relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear group-data-[collapsible=offcanvas]:w-0" />

      {/* Fixed panel */}
      <div
        data-side="right"
        className="fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) border-l transition-[left,right,width] duration-200 ease-linear data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] md:flex"
      >
        <RightSidebarInner />
      </div>
    </div>
  );
}
