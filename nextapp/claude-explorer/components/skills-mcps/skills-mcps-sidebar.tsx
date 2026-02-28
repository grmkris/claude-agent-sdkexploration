"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { AddCommandForm } from "@/components/skills-mcps/add-command-form";
import { AddMcpForm } from "@/components/skills-mcps/add-mcp-form";
import { EnvVarsSection } from "@/components/skills-mcps/env-vars-section";
import { McpServerList } from "@/components/skills-mcps/mcp-server-list";
import { SkillCommandList } from "@/components/skills-mcps/skill-command-list";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SkillsMcpsSidebar({ slug }: { slug: string | null }) {
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [showAddCommand, setShowAddCommand] = useState(false);

  const { data: userConfig, isLoading: userLoading } = useQuery(
    orpc.user.config.queryOptions()
  );

  const { data: projectConfig, isLoading: projectLoading } = useQuery({
    ...orpc.projects.config.queryOptions({ input: { slug: slug ?? "" } }),
    enabled: !!slug,
  });

  const isLoading = userLoading || (!!slug && projectLoading);

  const allSkills = [
    ...(userConfig?.skills ?? []),
    ...(projectConfig?.skills ?? []).filter((s) => s.scope === "project"),
  ];

  // Merge all servers for flat display
  const userServers = (userConfig?.mcpServers ?? {}) as Record<string, unknown>;
  const projectServers = (projectConfig?.mcpServers ?? null) as Record<
    string,
    unknown
  > | null;
  const localServers = (projectConfig?.localMcpServers ?? {}) as Record<
    string,
    unknown
  >;

  if (isLoading) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {Array.from({ length: 5 }).map((_, i) => (
              <SidebarMenuItem key={i}>
                <SidebarMenuSkeleton />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <div className="flex flex-col">
      {/* ── Skills / Commands ── */}
      <Collapsible defaultOpen>
        <SidebarGroup className="pb-1">
          <div className="flex items-center">
            <CollapsibleTrigger className="flex h-8 flex-1 cursor-pointer select-none items-center px-2 text-left text-xs font-medium text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground">
              Skills ({allSkills.length})
            </CollapsibleTrigger>
            {slug && (
              <button
                onClick={() => setShowAddCommand((v) => !v)}
                title="Add project command"
                className="mr-2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <CollapsibleContent>
            <SidebarGroupContent>
              {showAddCommand && slug && (
                <div className="px-2 pb-1">
                  <AddCommandForm
                    slug={slug}
                    compact
                    onDone={() => setShowAddCommand(false)}
                  />
                </div>
              )}
              <SkillCommandList
                skills={allSkills}
                slug={slug ?? undefined}
                compact
              />
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>

      {/* ── MCP Servers ── */}
      <Collapsible defaultOpen>
        <SidebarGroup className="py-1">
          <div className="flex items-center">
            <CollapsibleTrigger className="flex h-8 flex-1 cursor-pointer select-none items-center px-2 text-left text-xs font-medium text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground">
              MCP Servers
            </CollapsibleTrigger>
            {slug && (
              <button
                onClick={() => setShowAddMcp((v) => !v)}
                title="Add MCP server"
                className="mr-2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <PlusIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <CollapsibleContent>
            <SidebarGroupContent>
              {showAddMcp && slug && (
                <div className="px-2 pb-1">
                  <AddMcpForm
                    slug={slug}
                    compact
                    onDone={() => setShowAddMcp(false)}
                  />
                </div>
              )}
              <McpServerList
                slug={slug ?? undefined}
                userServers={userServers}
                projectServers={projectServers}
                localServers={localServers}
                compact
                showScopeExplainer={false}
              />
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>

      {/* ── Environment Variables ── */}
      {slug && <EnvVarsSection slug={slug} compact />}

      {/* ── Footer link ── */}
      {slug && (
        <div className="px-2 pb-1 pt-2">
          <Link
            href={`/project/${slug}/skills`}
            className="text-[10px] text-muted-foreground hover:text-foreground hover:underline transition-colors"
          >
            Open Skills & MCPs page &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
