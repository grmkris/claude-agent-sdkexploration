"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import type { SkillsShSkill } from "@/lib/mcp-catalog";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";

function formatInstalls(n: number): string {
  if (n >= 1000) return `${Math.floor(n / 1000)}k`;
  return String(n);
}

export function SkillCatalogBrowser({
  compact = false,
}: {
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [justInstalled, setJustInstalled] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timerRef.current);
  }, [search]);

  const { data, isLoading } = useQuery(
    orpc.skills.catalog.queryOptions({
      input: {
        search: debouncedSearch || undefined,
        limit: 30,
      },
    })
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: orpc.user.config.queryOptions().queryKey,
    });
  };

  const installSkill = useMutation({
    mutationFn: (skill: SkillsShSkill) =>
      client.skills.installFromCatalog({
        installCommand: `${skill.source} --skill ${skill.skillId}`,
      }),
    onSuccess: (result, skill) => {
      if (result.success) {
        invalidate();
        setJustInstalled(skill.id);
        setTimeout(() => {
          setJustInstalled(null);
          setExpandedId(null);
        }, 1500);
      }
    },
  });

  const skills = data?.skills ?? [];

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="Search skills.sh..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={compact ? "h-7 text-xs" : "h-8 text-sm"}
      />

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {!isLoading && skills.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {debouncedSearch ? "No skills found." : "No skills available."}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {skills.map((skill) => {
          const isExpanded = expandedId === skill.id;
          const isInstalling =
            installSkill.isPending && installSkill.variables?.id === skill.id;
          const wasJustInstalled = justInstalled === skill.id;
          const installCmd = `npx skills add ${skill.source} --skill ${skill.skillId} -y`;

          return (
            <div key={skill.id} className="flex flex-col">
              <Card
                size="sm"
                className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                  isExpanded ? "ring-1 ring-foreground/20" : ""
                } ${wasJustInstalled ? "ring-1 ring-green-400/50" : ""}`}
                onClick={() =>
                  !wasJustInstalled &&
                  setExpandedId(isExpanded ? null : skill.id)
                }
              >
                <CardContent className="flex flex-col gap-1.5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{skill.name}</span>
                    <Badge variant="outline" className="text-[10px] ml-auto">
                      {formatInstalls(skill.installs)}
                    </Badge>
                    {wasJustInstalled && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-[10px]"
                      >
                        {"\u2713"} Installed!
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug font-mono truncate">
                    {skill.source}
                  </p>
                  {!isExpanded && !wasJustInstalled && (
                    <div className="flex items-center">
                      <Button
                        size="xs"
                        variant="outline"
                        className="ml-auto h-5 px-2 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedId(skill.id);
                        }}
                      >
                        Install
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {isExpanded && (
                <Card size="sm" className="border-t-0">
                  <CardContent className="flex flex-col gap-2 py-3">
                    <p className="text-[11px] text-muted-foreground">
                      This will run{" "}
                      <code className="font-mono text-foreground">
                        {installCmd}
                      </code>
                    </p>
                    <div className="flex gap-2 items-center">
                      <Button
                        size="xs"
                        className="h-6 px-3 text-[11px]"
                        disabled={isInstalling}
                        onClick={() => installSkill.mutate(skill)}
                      >
                        {isInstalling ? "Installing..." : "Install"}
                      </Button>
                      <a
                        href={`https://skills.sh/skill/${skill.source}/${skill.skillId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-muted-foreground hover:text-foreground underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View on skills.sh
                      </a>
                      <button
                        onClick={() => setExpandedId(null)}
                        className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                    {installSkill.data &&
                      !installSkill.data.success &&
                      expandedId === skill.id && (
                        <p className="text-xs text-red-400">
                          {installSkill.data.error}
                        </p>
                      )}
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        Powered by{" "}
        <a
          href="https://skills.sh"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          skills.sh
        </a>
      </p>
    </div>
  );
}
