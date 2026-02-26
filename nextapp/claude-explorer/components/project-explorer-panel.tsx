"use client";

import {
  Clock01Icon,
  FolderOpenIcon,
  GitBranchIcon,
  Home01Icon,
  Lightning,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AutomationsTab } from "@/components/right-sidebar/automations-tab";
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
import { orpc } from "@/lib/orpc";

type TabValue = "overview" | "skills" | "git" | "files" | "automations";

const TABS = [
  { value: "overview", icon: Home01Icon, label: "Overview" },
  { value: "skills", icon: Lightning, label: "Skills & MCPs" },
  { value: "git", icon: GitBranchIcon, label: "Git" },
  { value: "files", icon: FolderOpenIcon, label: "Files" },
  { value: "automations", icon: Clock01Icon, label: "Automations" },
] as const;

/**
 * 4-tab explorer panel (Overview, Skills/MCPs, Git, Files).
 * Rendered inside the LEFT sidebar when on a project page.
 */
export function ProjectExplorerPanel({ slug }: { slug: string }) {
  const [activeTab, setActiveTab] = useState<TabValue>("overview");

  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const project = projects?.find((p) => p.slug === slug);
  const projectName = project
    ? (project.path.split("/").at(-1) ?? slug)
    : slug.replace(/-/g, " ");

  const { data: gitStatus } = useQuery({
    ...orpc.projects.gitStatus.queryOptions({ input: { slug } }),
    refetchInterval: 15_000,
  });
  const gitChangeCount = gitStatus?.changes?.length ?? 0;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as TabValue)}
      className="flex flex-1 flex-col"
    >
      <SidebarHeader className="border-b p-0">
        <div className="px-3 py-2 text-xs font-semibold text-sidebar-foreground truncate">
          {projectName}
        </div>
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
                    className="relative flex-1 justify-center px-0"
                  />
                }
              >
                <HugeiconsIcon icon={icon} size={15} strokeWidth={2} />
                {value === "git" && gitChangeCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-yellow-400" />
                )}
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
        <TabsContent value="automations" hidden={activeTab !== "automations"}>
          <AutomationsTab slug={slug} />
        </TabsContent>
      </SidebarContent>
    </Tabs>
  );
}
