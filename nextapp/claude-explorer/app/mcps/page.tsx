"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AddMcpForm } from "@/components/skills-mcps/add-mcp-form";
import { McpCatalogBrowser } from "@/components/skills-mcps/mcp-catalog-browser";
import { McpServerList } from "@/components/skills-mcps/mcp-server-list";
import { SkillCatalogBrowser } from "@/components/skills-mcps/skill-catalog-browser";
import { SkillCommandList } from "@/components/skills-mcps/skill-command-list";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";

// --- Custom Skill Authoring (user-level) ---

function AddSkillCard() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  const addSkill = useMutation({
    mutationFn: () => client.skills.add({ name, content }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orpc.user.config.queryOptions().queryKey,
      });
      setName("");
      setContent("");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add User Skill</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <Input
            placeholder="Skill name (directory name)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-64"
          />
          <textarea
            placeholder={
              "---\nname: my-skill\ndescription: Does something\n---\n\nSkill content here..."
            }
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[120px] rounded border bg-background px-3 py-2 text-sm font-mono"
          />
          <Button
            size="sm"
            className="w-fit"
            disabled={!name || !content || addSkill.isPending}
            onClick={() => addSkill.mutate()}
          >
            {addSkill.isPending ? "Saving..." : "Save Skill"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Custom Command Authoring (user-level) ---

function AddCommandCard() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  const addCommand = useMutation({
    mutationFn: () =>
      client.skills.addCommand({ name, content, scope: "user" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orpc.user.config.queryOptions().queryKey,
      });
      setName("");
      setContent("");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add User Command</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <Input
            placeholder="Command name (without .md)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-64"
          />
          <textarea
            placeholder="Command content (markdown)..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[100px] rounded border bg-background px-3 py-2 text-sm font-mono"
          />
          <Button
            size="sm"
            className="w-fit"
            disabled={!name || !content || addCommand.isPending}
            onClick={() => addCommand.mutate()}
          >
            {addCommand.isPending ? "Saving..." : "Save Command"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Page ---

export default function McpsPage() {
  const { data: userConfig } = useQuery({
    ...orpc.user.config.queryOptions(),
    refetchInterval: 30000,
  });
  const [showAddMcp, setShowAddMcp] = useState(false);

  const allSkills = userConfig?.skills ?? [];
  const skills = allSkills.filter((s) => s.type === "skill");
  const commands = allSkills.filter(
    (s) => s.type === "command" && s.scope === "user"
  );

  return (
    <div className="flex-1 overflow-auto p-4">
      <h1 className="mb-4 text-lg font-semibold">MCP Servers & Skills</h1>

      <Tabs defaultValue="mcp-catalog">
        <div className="flex items-center gap-3 mb-3">
          <TabsList variant="line">
            <TabsTrigger value="mcp-catalog">MCP Catalog</TabsTrigger>
            <TabsTrigger value="skill-catalog">Skills Catalog</TabsTrigger>
            <TabsTrigger value="installed">Installed (User)</TabsTrigger>
          </TabsList>
          <div className="flex-1" />
          <Button
            size="xs"
            variant="outline"
            className="h-6 px-2 text-[10px]"
            onClick={() => setShowAddMcp((v) => !v)}
          >
            {showAddMcp ? "Cancel" : "+ Add Custom MCP"}
          </Button>
        </div>

        {showAddMcp && (
          <div className="mb-4 rounded border p-3">
            <h3 className="mb-2 text-xs font-medium">Add Custom MCP Server</h3>
            <AddMcpForm showScopeSelector onDone={() => setShowAddMcp(false)} />
          </div>
        )}

        <TabsContent value="mcp-catalog">
          <McpCatalogBrowser
            defaultScope="user"
            showScopeSelector
            showProjectSelector
          />
        </TabsContent>

        <TabsContent value="skill-catalog">
          <SkillCatalogBrowser />
        </TabsContent>

        <TabsContent value="installed">
          <div className="flex flex-col gap-8">
            {/* User MCP Servers */}
            <McpServerList
              userServers={
                (userConfig?.mcpServers ?? {}) as Record<string, unknown>
              }
              showUserServers
              showScopeExplainer={false}
            />

            {/* User Skills */}
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                User Skills ({skills.length})
              </h2>
              <AddSkillCard />
              <SkillCommandList skills={skills} />
            </div>

            {/* User Commands */}
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                User Commands ({commands.length})
              </h2>
              <AddCommandCard />
              <SkillCommandList skills={commands} />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
