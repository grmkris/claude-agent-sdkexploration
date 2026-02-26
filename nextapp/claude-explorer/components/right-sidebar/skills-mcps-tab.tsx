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

  const {
    data: userConfig,
    isLoading: userLoading,
    isError: userError,
    refetch: userRefetch,
  } = useQuery(orpc.user.config.queryOptions());

  const {
    data: projectConfig,
    isLoading: projectLoading,
    isError: projectError,
    refetch: projectRefetch,
  } = useQuery({
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
    if (mcpResults[key]?.tools.length > 0) return;
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

  const configError = userError || projectError;

  return (
    <div className="flex flex-col">
      {/* Config error banner */}
      {configError && (
        <div className="mx-2 mb-2 flex items-center gap-2 rounded bg-red-500/10 px-2 py-1.5 text-[11px] text-red-400">
          <span className="flex-1">
            Failed to load {userError ? "user" : "project"} config
          </span>
          <button
            className="shrink-0 rounded px-1.5 py-0.5 hover:bg-red-500/20"
            onClick={() => {
              void userRefetch();
              void projectRefetch();
            }}
          >
            Retry
          </button>
        </div>
      )}

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
                  {configError
                    ? "Could not load skills"
                    : "No skills installed"}
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
              {configError
                ? "Could not load MCP servers"
                : "No MCP servers configured"}
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
                          {/* Status dot */}
                          <span
                            className={cn(
                              "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                              isConnecting
                                ? "animate-pulse bg-yellow-500"
                                : result?.error
                                  ? "bg-red-500"
                                  : result?.tools.length
                                    ? "bg-green-500"
                                    : "bg-muted-foreground/30"
                            )}
                          />
                          <span className="truncate">{name}</span>
                          {/* Collapsed tool count */}
                          {!isExpanded &&
                            !isConnecting &&
                            result?.tools.length > 0 && (
                              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                                {result.tools.length} tools
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
                              <div className="flex items-start gap-1.5 px-2 py-1.5">
                                <p className="max-h-20 flex-1 overflow-auto text-[11px] text-red-400">
                                  {result.error}
                                </p>
                                <button
                                  className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMcpResults((prev) => {
                                      const next = { ...prev };
                                      delete next[key];
                                      return next;
                                    });
                                    void handleMcpToggle(name, group.scope);
                                  }}
                                >
                                  Retry
                                </button>
                                <button
                                  className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMcpResults((prev) => {
                                      const next = { ...prev };
                                      delete next[key];
                                      return next;
                                    });
                                    setExpandedMcp(null);
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
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
