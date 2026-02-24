"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SKILL_CATALOG, type SkillCatalogEntry } from "@/lib/mcp-catalog";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";

export function SkillCatalogView() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: orpc.user.config.queryOptions().queryKey,
    });
  };

  const installSkill = useMutation({
    mutationFn: (entry: SkillCatalogEntry) =>
      client.skills.installFromCatalog({
        installCommand: entry.installCommand,
      }),
    onSuccess: (result) => {
      if (result.success) {
        invalidate();
        setExpandedId(null);
      }
    },
  });

  if (SKILL_CATALOG.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No skills available in catalog yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {SKILL_CATALOG.map((entry) => {
        const isExpanded = expandedId === entry.id;
        const isInstalling =
          installSkill.isPending && installSkill.variables?.id === entry.id;

        return (
          <div key={entry.id} className="flex flex-col">
            <Card
              size="sm"
              className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                isExpanded ? "ring-1 ring-foreground/20" : ""
              }`}
              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
            >
              <CardContent className="flex flex-col gap-1.5 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">{entry.emoji}</span>
                  <span className="text-sm font-medium">{entry.name}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {entry.description}
                </p>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {entry.category}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    npx skills add {entry.installCommand}
                  </span>
                  {!isExpanded && (
                    <Button
                      size="xs"
                      variant="outline"
                      className="ml-auto h-5 px-2 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedId(entry.id);
                      }}
                    >
                      Install
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {isExpanded && (
              <Card size="sm" className="border-t-0">
                <CardContent className="flex flex-col gap-2 py-3">
                  <p className="text-[11px] text-muted-foreground">
                    This will run{" "}
                    <code className="font-mono text-foreground">
                      npx skills add {entry.installCommand}
                    </code>
                  </p>
                  <div className="flex gap-2 items-center">
                    <Button
                      size="xs"
                      className="h-6 px-3 text-[11px]"
                      disabled={isInstalling}
                      onClick={() => installSkill.mutate(entry)}
                    >
                      {isInstalling ? "Installing..." : "Install"}
                    </Button>
                    {entry.docsUrl && (
                      <a
                        href={entry.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-muted-foreground hover:text-foreground underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Docs
                      </a>
                    )}
                    <button
                      onClick={() => setExpandedId(null)}
                      className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                  {installSkill.data &&
                    !installSkill.data.success &&
                    expandedId === entry.id && (
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
  );
}
