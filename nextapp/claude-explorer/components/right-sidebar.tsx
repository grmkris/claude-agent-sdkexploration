"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import { FileTreeTab } from "@/components/right-sidebar/file-tree-tab";
import { RecentConversationsTab } from "@/components/right-sidebar/recent-conversations-tab";
import { SkillsMcpsTab } from "@/components/right-sidebar/skills-mcps-tab";
import { useRightSidebar } from "@/components/ui/right-sidebar-context";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SidebarContent, SidebarHeader } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const RIGHT_SIDEBAR_WIDTH = "17rem";
const RIGHT_SIDEBAR_WIDTH_MOBILE = "18rem";

type TabValue = "recent" | "skills" | "files";

function RightSidebarInner({
  activeSlug,
  activeTab,
  onTabChange,
}: {
  activeSlug: string | null;
  activeTab: TabValue;
  onTabChange: (tab: TabValue) => void;
}) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as TabValue)}
      className="bg-sidebar flex size-full flex-col"
    >
      <SidebarHeader className="p-0 border-b">
        <TabsList variant="line" className="w-full px-2 rounded-none h-10">
          <TabsTrigger value="recent">Recent</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          {activeSlug && <TabsTrigger value="files">Files</TabsTrigger>}
        </TabsList>
      </SidebarHeader>
      <SidebarContent>
        <TabsContent value="recent" hidden={activeTab !== "recent"}>
          <RecentConversationsTab />
        </TabsContent>
        <TabsContent value="skills" hidden={activeTab !== "skills"}>
          <SkillsMcpsTab slug={activeSlug} />
        </TabsContent>
        {activeSlug && (
          <TabsContent value="files" hidden={activeTab !== "files"}>
            <FileTreeTab slug={activeSlug} />
          </TabsContent>
        )}
      </SidebarContent>
    </Tabs>
  );
}

export function RightSidebar() {
  const { state, openMobile, setOpenMobile, isMobile } = useRightSidebar();
  const [activeTab, setActiveTab] = useState<TabValue>("recent");
  const pathname = usePathname();

  const projectMatch = pathname.match(/^\/project\/([^/]+)/);
  const activeSlug = projectMatch?.[1] ?? null;

  // Switch away from files tab if we navigate away from a project
  const effectiveTab =
    activeTab === "files" && !activeSlug ? "recent" : activeTab;

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
            <SheetTitle>Right Sidebar</SheetTitle>
            <SheetDescription>
              Recent conversations, skills, MCPs, and file tree.
            </SheetDescription>
          </SheetHeader>
          <RightSidebarInner
            activeSlug={activeSlug}
            activeTab={effectiveTab}
            onTabChange={setActiveTab}
          />
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: replicate the 3-div structure from sidebar.tsx but driven by
  // useRightSidebar() — avoids the useSidebar() context conflict.
  return (
    <div
      className="group peer text-sidebar-foreground hidden md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? "offcanvas" : ""}
      data-variant="sidebar"
      data-side="right"
      style={{ "--sidebar-width": RIGHT_SIDEBAR_WIDTH } as React.CSSProperties}
    >
      {/* Gap placeholder — shrinks to 0 when offcanvas, pushing main content */}
      <div className="relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear group-data-[collapsible=offcanvas]:w-0" />

      {/* Fixed panel */}
      <div
        data-side="right"
        className="fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) border-l transition-[left,right,width] duration-200 ease-linear data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] md:flex"
      >
        <RightSidebarInner
          activeSlug={activeSlug}
          activeTab={effectiveTab}
          onTabChange={setActiveTab}
        />
      </div>
    </div>
  );
}
