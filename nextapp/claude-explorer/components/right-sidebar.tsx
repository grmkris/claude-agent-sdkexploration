"use client";

import {
  FolderOpenIcon,
  GitBranchIcon,
  Home01Icon,
  Lightning,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { FileTreeTab } from "@/components/right-sidebar/file-tree-tab";
import { GitTab } from "@/components/right-sidebar/git-tab";
import { OverviewTab } from "@/components/right-sidebar/overview-tab";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const RIGHT_SIDEBAR_WIDTH = "17rem";
const RIGHT_SIDEBAR_WIDTH_MOBILE = "18rem";

type TabValue = "overview" | "skills" | "git" | "files";

const TABS = [
  { value: "overview", icon: Home01Icon, label: "Overview" },
  { value: "skills", icon: Lightning, label: "Skills & MCPs" },
  { value: "git", icon: GitBranchIcon, label: "Git" },
  { value: "files", icon: FolderOpenIcon, label: "Files" },
] as const;

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
      <SidebarHeader className="border-b p-0">
        <TabsList
          variant="line"
          className="h-10 w-full rounded-none px-1 gap-0"
        >
          {TABS.map(({ value, icon, label }) => (
            <Tooltip key={value}>
              <TooltipTrigger
                render={
                  <TabsTrigger
                    value={value}
                    className="flex-1 justify-center px-0"
                  />
                }
              >
                <HugeiconsIcon icon={icon} size={15} strokeWidth={2} />
                <span className="sr-only">{label}</span>
              </TooltipTrigger>
              <TooltipContent side="bottom">{label}</TooltipContent>
            </Tooltip>
          ))}
        </TabsList>
      </SidebarHeader>
      <SidebarContent>
        <TabsContent value="overview" hidden={activeTab !== "overview"}>
          <OverviewTab slug={activeSlug} />
        </TabsContent>
        <TabsContent value="skills" hidden={activeTab !== "skills"}>
          <SkillsMcpsTab slug={activeSlug} />
        </TabsContent>
        <TabsContent value="git" hidden={activeTab !== "git"}>
          <GitTab slug={activeSlug} />
        </TabsContent>
        <TabsContent value="files" hidden={activeTab !== "files"}>
          <FileTreeTab slug={activeSlug} />
        </TabsContent>
      </SidebarContent>
    </Tabs>
  );
}

export function RightSidebar() {
  const { state, openMobile, setOpenMobile, isMobile } = useRightSidebar();
  const [activeTab, setActiveTab] = useState<TabValue>("overview");
  const pathname = usePathname();

  const projectMatch = pathname.match(/^\/project\/([^/]+)/);
  const activeSlug = projectMatch?.[1] ?? null;

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
              Recent conversations, skills, MCPs, git, and file tree.
            </SheetDescription>
          </SheetHeader>
          <RightSidebarInner
            activeSlug={activeSlug}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
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
        <RightSidebarInner
          activeSlug={activeSlug}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>
    </div>
  );
}
