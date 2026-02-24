"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

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
import { client } from "@/lib/orpc-client";
import { cn } from "@/lib/utils";

type McpTool = { name: string; description?: string };
type McpResult = { tools: McpTool[]; error?: string };
type McpScope = "user" | "local" | "project";

export function SkillsMcpsTab({ slug }: { slug: string | null }) {
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [skillContents, setSkillContents] = useState<Record<string, string>>(
    {}
  );
  const [loadingSkill, setLoadingSkill] = useState<string | null>(null);

  const [expandedMcp, setExpandedMcp] = useState<string | null>(null);
  const [mcpResults, setMcpResults] = useState<Record<string, McpResult>>({});
  const [loadingMcp, setLoadingMcp] = useState<string | null>(null);

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

  const mcpGroups: { label: string; scope: McpScope; servers: string[] }[] = [
    {
      label: "User MCPs",
      scope: "user" as const,
      servers: Object.keys(userConfig?.mcpServers ?? {}),
    },
    {
      label: "Project MCPs",
      scope: "project" as const,
      servers: Object.keys(projectConfig?.mcpServers ?? {}),
    },
    {
      label: "Local MCPs",
      scope: "local" as const,
      servers: Object.keys(projectConfig?.localMcpServers ?? {}),
    },
  ].filter((g) => g.servers.length > 0);

  const handleSkillToggle = async (
    skillName: string,
    skillType: "skill" | "command",
    skillScope: "user" | "project"
  ) => {
    if (expandedSkill === skillName) {
      setExpandedSkill(null);
      return;
    }
    setExpandedSkill(skillName);
    if (skillContents[skillName] !== undefined) return;
    setLoadingSkill(skillName);
    try {
      const result = await client.skills.getContent({
        name: skillName,
        type: skillType,
        scope: skillScope,
        ...(slug ? { slug } : {}),
      });
      setSkillContents((prev) => ({
        ...prev,
        [skillName]: result.content ?? "(no content)",
      }));
    } catch {
      setSkillContents((prev) => ({
        ...prev,
        [skillName]: "(failed to load)",
      }));
    } finally {
      setLoadingSkill(null);
    }
  };

  const handleMcpToggle = async (name: string, scope: McpScope) => {
    const key = `${scope}:${name}`;
    if (expandedMcp === key) {
      setExpandedMcp(null);
      return;
    }
    setExpandedMcp(key);
    if (mcpResults[key] !== undefined) return;
    setLoadingMcp(key);
    try {
      const result = await client.mcpServers.inspectTools({
        name,
        scope,
        ...(slug ? { slug } : {}),
      });
      setMcpResults((prev) => ({ ...prev, [key]: result }));
    } catch (e) {
      setMcpResults((prev) => ({
        ...prev,
        [key]: {
          tools: [],
          error: e instanceof Error ? e.message : "Inspection failed",
        },
      }));
    } finally {
      setLoadingMcp(null);
    }
  };

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
          <CollapsibleTrigger className="flex h-8 w-full cursor-pointer select-none items-center px-2 text-left text-xs font-medium text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground">
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
                      <SidebarMenuButton
                        onClick={() =>
                          handleSkillToggle(skill.name, skill.type, skill.scope)
                        }
                        isActive={expandedSkill === skill.name}
                      >
                        <span className="truncate">{skill.name}</span>
                        <span className="ml-auto shrink-0 text-muted-foreground">
                          {skill.scope}
                        </span>
                      </SidebarMenuButton>
                      {expandedSkill === skill.name && (
                        <div className="border-t border-sidebar-border">
                          {loadingSkill === skill.name ? (
                            <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                              Loading…
                            </p>
                          ) : (
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words bg-muted/20 p-2 text-[11px] leading-relaxed text-muted-foreground">
                              {skillContents[skill.name]}
                            </pre>
                          )}
                        </div>
                      )}
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
            <CollapsibleTrigger className="flex h-8 w-full cursor-pointer select-none items-center px-2 text-left text-xs font-medium text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground">
              {group.label} ({group.servers.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.servers.map((name) => {
                    const key = `${group.scope}:${name}`;
                    const result = mcpResults[key];
                    const isExpanded = expandedMcp === key;
                    const isConnecting = loadingMcp === key;

                    return (
                      <SidebarMenuItem key={name}>
                        <SidebarMenuButton
                          onClick={() => handleMcpToggle(name, group.scope)}
                          isActive={isExpanded}
                        >
                          <span className="truncate">{name}</span>
                          {result && !isConnecting && (
                            <span
                              className={cn(
                                "ml-auto shrink-0 text-[10px]",
                                result.error ? "text-red-400" : "text-green-400"
                              )}
                            >
                              {result.error
                                ? "✗ error"
                                : `✓ ${result.tools.length} tools`}
                            </span>
                          )}
                          {isConnecting && (
                            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                              connecting…
                            </span>
                          )}
                        </SidebarMenuButton>

                        {isExpanded && (
                          <div className="border-t border-sidebar-border">
                            {isConnecting ? (
                              <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                                Connecting to MCP server…
                              </p>
                            ) : result?.error ? (
                              <p className="px-2 py-1.5 text-[11px] text-red-400">
                                {result.error}
                              </p>
                            ) : result?.tools.length === 0 ? (
                              <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                                No tools exposed
                              </p>
                            ) : (
                              <div className="py-1">
                                {result?.tools.map((tool) => (
                                  <div
                                    key={tool.name}
                                    className="px-2 py-1 hover:bg-sidebar-accent/50"
                                  >
                                    <p className="font-mono text-[11px] text-foreground">
                                      {tool.name}
                                    </p>
                                    {tool.description && (
                                      <p className="text-[10px] text-muted-foreground">
                                        {tool.description}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      ))}
    </div>
  );
}
