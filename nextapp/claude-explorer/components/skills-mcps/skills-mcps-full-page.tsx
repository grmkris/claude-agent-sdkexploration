"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AddCommandForm } from "@/components/skills-mcps/add-command-form";
import { AddMcpForm } from "@/components/skills-mcps/add-mcp-form";
import { EnvVarsSection } from "@/components/skills-mcps/env-vars-section";
import { McpCatalogBrowser } from "@/components/skills-mcps/mcp-catalog-browser";
import { McpServerList } from "@/components/skills-mcps/mcp-server-list";
import { SkillCatalogBrowser } from "@/components/skills-mcps/skill-catalog-browser";
import { SkillCommandList } from "@/components/skills-mcps/skill-command-list";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

export function SkillsMcpsFullPage({ slug }: { slug: string }) {
  const [showAddMcp, setShowAddMcp] = useState(false);
  const [showAddCommand, setShowAddCommand] = useState(false);

  const { data: userConfig, isLoading: userLoading } = useQuery({
    ...orpc.user.config.queryOptions(),
    refetchInterval: 30000,
  });

  const { data: projectConfig, isLoading: projectLoading } = useQuery({
    ...orpc.projects.config.queryOptions({ input: { slug } }),
    enabled: !!slug,
    refetchInterval: 30000,
  });

  const isLoading = userLoading || projectLoading;

  // Merge skills: project-scoped commands + user skills + user commands
  const allSkills = [
    ...(projectConfig?.skills ?? []).filter((s) => s.scope === "project"),
    ...(userConfig?.skills ?? []),
  ];

  if (isLoading) {
    return (
      <div className="flex-1 p-4">
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded border bg-muted/20"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <Tabs defaultValue="installed">
        <div className="flex items-center justify-between mb-3">
          <TabsList variant="line">
            <TabsTrigger value="installed">Installed</TabsTrigger>
            <TabsTrigger value="mcp-catalog">MCP Catalog</TabsTrigger>
            <TabsTrigger value="skill-catalog">Skills Catalog</TabsTrigger>
          </TabsList>
          <Button
            size="xs"
            variant="outline"
            className="h-6 gap-1 text-[11px]"
            onClick={() => setShowAddMcp((v) => !v)}
          >
            <PlusIcon className="h-3 w-3" />
            Add Custom
          </Button>
        </div>

        {/* Inline add custom MCP form */}
        {showAddMcp && (
          <div className="mb-4 rounded border p-3">
            <h3 className="mb-2 text-xs font-medium">Add Custom MCP Server</h3>
            <AddMcpForm
              slug={slug}
              defaultScope="local"
              showScopeSelector
              onDone={() => setShowAddMcp(false)}
            />
          </div>
        )}

        {/* ── Installed Tab ── */}
        <TabsContent value="installed">
          <div className="flex flex-col gap-6">
            {/* MCP Servers */}
            <McpServerList
              slug={slug}
              userServers={
                (userConfig?.mcpServers ?? {}) as Record<string, unknown>
              }
              projectServers={
                (projectConfig?.mcpServers ?? null) as Record<
                  string,
                  unknown
                > | null
              }
              localServers={
                (projectConfig?.localMcpServers ?? {}) as Record<
                  string,
                  unknown
                >
              }
              showUserServers
              showScopeExplainer
            />

            {/* Skills & Commands */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Skills & Commands ({allSkills.length})
                </h3>
                <button
                  onClick={() => setShowAddCommand((v) => !v)}
                  title="Add project command"
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              {showAddCommand && (
                <AddCommandForm
                  slug={slug}
                  onDone={() => setShowAddCommand(false)}
                />
              )}
              <SkillCommandList skills={allSkills} slug={slug} />
            </div>

            {/* Environment Variables */}
            <EnvVarsSection slug={slug} />
          </div>
        </TabsContent>

        {/* ── MCP Catalog Tab ── */}
        <TabsContent value="mcp-catalog">
          <McpCatalogBrowser slug={slug} defaultScope="local" />
        </TabsContent>

        {/* ── Skills Catalog Tab ── */}
        <TabsContent value="skill-catalog">
          <SkillCatalogBrowser />
        </TabsContent>
      </Tabs>
    </div>
  );
}
