"use client";

import {
  FolderOpenIcon,
  GitBranchIcon,
  Home01Icon,
  Lightning,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import { FileTreeTab } from "@/components/right-sidebar/file-tree-tab";
import { GitTab } from "@/components/right-sidebar/git-tab";
import { OverviewTab } from "@/components/right-sidebar/overview-tab";
import { SkillsMcpsTab } from "@/components/right-sidebar/skills-mcps-tab";
import { SidebarContent, SidebarHeader } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type TabValue = "overview" | "skills" | "git" | "files";

const TABS = [
  { value: "overview", icon: Home01Icon, label: "Overview" },
  { value: "skills", icon: Lightning, label: "Skills & MCPs" },
  { value: "git", icon: GitBranchIcon, label: "Git" },
  { value: "files", icon: FolderOpenIcon, label: "Files" },
] as const;

/**
 * 4-tab explorer panel (Overview, Skills/MCPs, Git, Files).
 * Rendered inside the LEFT sidebar when on a project page.
 */
export function ProjectExplorerPanel({ slug }: { slug: string }) {
  const [activeTab, setActiveTab] = useState<TabValue>("overview");

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as TabValue)}
      className="flex flex-1 flex-col"
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
          <OverviewTab slug={slug} />
        </TabsContent>
        <TabsContent value="skills" hidden={activeTab !== "skills"}>
          <SkillsMcpsTab slug={slug} />
        </TabsContent>
        <TabsContent value="git" hidden={activeTab !== "git"}>
          <GitTab slug={slug} />
        </TabsContent>
        <TabsContent value="files" hidden={activeTab !== "files"}>
          <FileTreeTab slug={slug} />
        </TabsContent>
      </SidebarContent>
    </Tabs>
  );
}
