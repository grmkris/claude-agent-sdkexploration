"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ProjectIntegrations } from "@/components/project-integrations";
import {
  ProjectClaudeMd,
  ProjectCrons,
  ProjectFiles,
  ProjectSkills,
  ProjectStatsHeader,
  ProjectTmux,
  ProjectWebhooks,
  TmuxLauncher,
} from "@/components/project-sidebar-sections";
import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";

export function ProjectContextSection({ slug }: { slug: string }) {
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const project = projects?.find((p) => p.slug === slug);

  const shortPath = project?.path?.split("/").slice(-2).join("/") ?? slug;
  const gitRemoteUrl = project?.gitRemoteUrl;
  const gitDisplayHost = gitRemoteUrl
    ? gitRemoteUrl.replace(/^https?:\/\//, "")
    : null;

  return (
    <>
      <SidebarSeparator />
      <SidebarGroup className="py-2">
        <SidebarGroupContent>
          {/* Project header: name + github link + new conversation button */}
          <div className="mb-2 flex items-center gap-1.5 px-1">
            <span className="min-w-0 flex-1 truncate text-xs font-semibold">
              {shortPath}
            </span>
            {gitDisplayHost && (
              <a
                href={gitRemoteUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
                title={gitRemoteUrl!}
              >
                {gitDisplayHost}
              </a>
            )}
            <Link href={`/project/${slug}/chat`} className="shrink-0">
              <Button size="sm" className="h-6 px-2 text-[10px]">
                + New
              </Button>
            </Link>
          </div>

          {/* All project config sections — each lazy-loads on expand */}
          <div className="flex flex-col gap-0.5">
            <ProjectStatsHeader slug={slug} />
            <ProjectSkills slug={slug} />
            <ProjectIntegrations slug={slug} />
            <ProjectTmux slug={slug} />
            <TmuxLauncher slug={slug} />
            <ProjectFiles slug={slug} />
            <ProjectClaudeMd slug={slug} />
            <ProjectCrons slug={slug} />
            <ProjectWebhooks slug={slug} />
          </div>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarSeparator />
      <SidebarGroupLabel className="px-3 pb-1 text-[10px] text-muted-foreground/60">
        Sessions
      </SidebarGroupLabel>
    </>
  );
}
