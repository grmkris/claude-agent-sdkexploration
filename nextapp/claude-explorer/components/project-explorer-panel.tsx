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
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { AutomationsTab } from "@/components/right-sidebar/automations-tab";
import { FileTreeTab } from "@/components/right-sidebar/file-tree-tab";
import { GitTab } from "@/components/right-sidebar/git-tab";
import { OverviewTab } from "@/components/right-sidebar/overview-tab";
import { SkillsMcpsTab } from "@/components/right-sidebar/skills-mcps-tab";
import {
  SidebarContent,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { orpc } from "@/lib/orpc";

type TabValue = "overview" | "skills" | "git" | "files" | "automations";

const TABS = [
  {
    value: "overview" as const,
    icon: Home01Icon,
    label: "Overview",
    page: (slug: string) => `/project/${slug}/overview`,
  },
  {
    value: "skills" as const,
    icon: Lightning,
    label: "Skills & MCPs",
    page: (slug: string) => `/project/${slug}/skills`,
  },
  {
    value: "git" as const,
    icon: GitBranchIcon,
    label: "Git",
    page: (slug: string) => `/project/${slug}/git`,
  },
  {
    value: "files" as const,
    icon: FolderOpenIcon,
    label: "Files",
    page: (slug: string) => `/project/${slug}/files`,
  },
  {
    value: "automations" as const,
    icon: Clock01Icon,
    label: "Automations",
    page: (slug: string) => `/project/${slug}/automations`,
  },
] as const;

/**
 * Project explorer panel rendered inside the LEFT sidebar.
 *
 * Expanded  → 5-tab panel with inline quick-action content.
 * Collapsed → vertical icon rail; each icon navigates to the
 *             corresponding full-page route and has a tooltip.
 */
export function ProjectExplorerPanel({ slug }: { slug: string }) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const pathname = usePathname();

  const [activeTab, setActiveTab] = useState<TabValue>("overview");

  const { data: gitStatus } = useQuery({
    ...orpc.projects.gitStatus.queryOptions({ input: { slug } }),
    refetchInterval: 15_000,
  });
  const gitChangeCount = gitStatus?.changes?.length ?? 0;

  // ── Collapsed: icon rail that links to full pages ──────────────────────────
  if (isCollapsed) {
    return (
      <div className="flex flex-1 flex-col items-center gap-0.5 py-1 overflow-hidden">
        {TABS.map(({ value, icon, label, page }) => {
          const href = page(slug);
          const isActive = pathname.startsWith(href);
          return (
            <Tooltip key={value}>
              <TooltipTrigger
                render={
                  <Link
                    href={href}
                    className={[
                      "relative flex h-8 w-8 items-center justify-center rounded-sm transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    ].join(" ")}
                  />
                }
              >
                <HugeiconsIcon icon={icon} size={15} strokeWidth={2} />
                {value === "git" && gitChangeCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-yellow-400" />
                )}
                <span className="sr-only">{label}</span>
              </TooltipTrigger>
              <TooltipContent side="right">
                <span className="font-medium">{label}</span>
                {value === "git" && gitChangeCount > 0 && (
                  <span className="ml-1.5 text-yellow-400">
                    {gitChangeCount} change{gitChangeCount !== 1 ? "s" : ""}
                  </span>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    );
  }

  // ── Expanded: tab strip + inline content ──────────────────────────────────
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
          {TABS.map(({ value, icon, label, page }) => (
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
              <TooltipContent
                side="bottom"
                className="flex items-center gap-1.5"
              >
                <span>{label}</span>
                <Link
                  href={page(slug)}
                  onClick={(e) => e.stopPropagation()}
                  className="opacity-50 hover:opacity-100 transition-opacity text-[10px]"
                  title={`Open ${label} page`}
                >
                  ↗
                </Link>
              </TooltipContent>
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
