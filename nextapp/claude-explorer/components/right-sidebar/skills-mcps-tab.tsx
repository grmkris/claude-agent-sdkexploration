"use client";

import { useQuery } from "@tanstack/react-query";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";

export function SkillsMcpsTab({ slug }: { slug: string | null }) {
  const { data: userConfig, isLoading: userLoading } = useQuery(
    orpc.user.config.queryOptions()
  );

  const { data: projectConfig, isLoading: projectLoading } = useQuery({
    ...orpc.projects.config.queryOptions({ input: { slug: slug ?? "" } }),
    enabled: !!slug,
  });

  const isLoading = userLoading || (!!slug && projectLoading);

  // Merge skills — dedupe by name+scope
  const allSkills = [
    ...(userConfig?.skills ?? []),
    ...(projectConfig?.skills ?? []).filter((s) => s.scope === "project"),
  ];

  const mcpGroups = [
    {
      label: "User MCPs",
      servers: Object.entries(userConfig?.mcpServers ?? {}),
    },
    {
      label: "Project MCPs",
      servers: Object.entries(projectConfig?.mcpServers ?? {}),
    },
    {
      label: "Local MCPs",
      servers: Object.entries(projectConfig?.localMcpServers ?? {}),
    },
  ].filter((g) => g.servers.length > 0);

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
      {/* Skills */}
      <Collapsible defaultOpen>
        <SidebarGroup className="pb-1">
          <CollapsibleTrigger className="text-sidebar-foreground/70 h-8 w-full px-2 text-left text-xs font-medium cursor-pointer select-none hover:text-sidebar-foreground transition-colors flex items-center">
            Skills ({allSkills.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarGroupContent>
              {allSkills.length === 0 ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  No skills installed
                </p>
              ) : (
                <SidebarMenu>
                  {allSkills.map((skill) => (
                    <SidebarMenuItem key={`${skill.scope}-${skill.name}`}>
                      <SidebarMenuButton>
                        <span className="truncate">{skill.name}</span>
                        <span className="ml-auto shrink-0 text-muted-foreground">
                          {skill.scope}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>

      {/* MCP groups */}
      {mcpGroups.length === 0 && (
        <SidebarGroup className="pt-0">
          <SidebarGroupContent>
            <p className="px-2 py-1 text-xs text-muted-foreground">
              No MCP servers configured
            </p>
          </SidebarGroupContent>
        </SidebarGroup>
      )}

      {mcpGroups.map((group) => (
        <Collapsible key={group.label} defaultOpen>
          <SidebarGroup className="py-1">
            <CollapsibleTrigger className="text-sidebar-foreground/70 h-8 w-full px-2 text-left text-xs font-medium cursor-pointer select-none hover:text-sidebar-foreground transition-colors flex items-center">
              {group.label} ({group.servers.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.servers.map(([name]) => (
                    <SidebarMenuItem key={name}>
                      <SidebarMenuButton>
                        <span className="truncate">{name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      ))}
    </div>
  );
}
