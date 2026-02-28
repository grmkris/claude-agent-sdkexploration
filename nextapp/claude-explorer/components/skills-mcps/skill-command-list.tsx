"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ScopeBadge } from "@/components/skills-mcps/scope-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";

interface SkillInfo {
  name: string;
  description: string;
  scope: "user" | "project";
  type: "skill" | "command";
}

function XIcon({ className }: { className?: string }) {
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
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function SkillCommandList({
  skills,
  slug,
  compact = false,
}: {
  skills: SkillInfo[];
  slug?: string;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [skillContents, setSkillContents] = useState<Record<string, string>>(
    {}
  );
  const [loadingSkill, setLoadingSkill] = useState<string | null>(null);

  const removeCommand = useMutation({
    mutationFn: (name: string) =>
      client.skills.removeCommand({
        name,
        scope: "project",
        ...(slug ? { slug } : {}),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.user.config.queryOptions().queryKey,
        }),
        ...(slug
          ? [
              queryClient.invalidateQueries({
                queryKey: orpc.projects.config.queryOptions({
                  input: { slug },
                }).queryKey,
              }),
            ]
          : []),
      ]);
    },
  });

  const removeSkill = useMutation({
    mutationFn: (name: string) => client.skills.remove({ name }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.user.config.queryOptions().queryKey,
      });
    },
  });

  const handleToggle = async (skill: SkillInfo) => {
    if (expandedSkill === skill.name) {
      setExpandedSkill(null);
      return;
    }
    setExpandedSkill(skill.name);
    if (skillContents[skill.name] !== undefined) return;
    setLoadingSkill(skill.name);
    try {
      const result = await client.skills.getContent({
        name: skill.name,
        type: skill.type,
        scope: skill.scope,
        ...(slug ? { slug } : {}),
      });
      setSkillContents((prev) => ({
        ...prev,
        [skill.name]: result.content ?? "(no content)",
      }));
    } catch {
      setSkillContents((prev) => ({
        ...prev,
        [skill.name]: "(failed to load)",
      }));
    } finally {
      setLoadingSkill(null);
    }
  };

  if (skills.length === 0) {
    return <p className="text-xs text-muted-foreground">No skills installed</p>;
  }

  // ── Compact (sidebar) mode ──
  if (compact) {
    return (
      <SidebarMenu>
        {skills.map((skill) => (
          <SidebarMenuItem key={`${skill.scope}-${skill.name}`}>
            <SidebarMenuButton
              onClick={() => handleToggle(skill)}
              isActive={expandedSkill === skill.name}
            >
              <span className="truncate">{skill.name}</span>
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                {skill.scope}
              </span>
              {skill.scope === "project" && slug && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCommand.mutate(skill.name);
                  }}
                  title="Remove command"
                  className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              )}
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
    );
  }

  // ── Full-size mode ──
  return (
    <div className="flex flex-col gap-1.5">
      {skills.map((skill) => {
        const isExpanded = expandedSkill === skill.name;
        const canRemove =
          skill.scope === "project" ||
          (skill.scope === "user" && skill.type === "skill");

        return (
          <div key={`${skill.scope}-${skill.name}`}>
            <Card
              size="sm"
              className="cursor-pointer transition-colors hover:bg-accent/50"
              onClick={() => handleToggle(skill)}
            >
              <CardContent className="flex items-center gap-2.5 py-2.5">
                <span className="shrink-0 text-sm font-medium">
                  /{skill.name}
                </span>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {skill.type}
                </Badge>
                <ScopeBadge scope={skill.scope} />
                {skill.description && (
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {skill.description}
                  </span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="xs"
                    variant="outline"
                    className="h-5 px-2 text-[10px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleToggle(skill);
                    }}
                  >
                    {isExpanded ? "Hide" : "View"}
                  </Button>
                  {canRemove && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (skill.type === "skill") {
                          removeSkill.mutate(skill.name);
                        } else {
                          removeCommand.mutate(skill.name);
                        }
                      }}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                      title="Remove"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
            {isExpanded && (
              <div className="ml-4 mt-1">
                {loadingSkill === skill.name ? (
                  <p className="py-2 text-xs text-muted-foreground animate-pulse">
                    Loading…
                  </p>
                ) : (
                  <pre className="max-h-64 overflow-auto rounded border bg-muted/20 p-2 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
                    {skillContents[skill.name]}
                  </pre>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
