"use client";

import { useQuery } from "@tanstack/react-query";

import { ActivityFeed } from "@/components/activity-feed";
import { IntegrationWidgets } from "@/components/project-integrations";
import { WorktreeInfoSection } from "@/components/right-sidebar/worktree-info-section";
import { TmuxSessionsPanel } from "@/components/tmux-sessions-panel";
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";

// ── Integration widgets (Railway, Linear, GitHub) ────────────────────────────

function IntegrationsSection({ slug }: { slug: string }) {
  const { data: integrations } = useQuery({
    ...orpc.integrations.list.queryOptions(),
    refetchInterval: 60_000,
  });

  const projectIntegrations =
    integrations?.filter((i) => i.projectSlug === slug && i.enabled) ?? [];

  if (projectIntegrations.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <div className="flex flex-col gap-3 px-2">
          {projectIntegrations.map((integration) => (
            <div key={integration.id}>
              <IntegrationWidgets integrationId={integration.id} />
            </div>
          ))}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// ── Tmux: active sessions list ───────────────────────────────────────────────

function TmuxSection({ slug }: { slug: string }) {
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const project = projects?.find((p) => p.slug === slug);

  return (
    <SidebarGroup>
      {/* Active sessions list — returns null when empty */}
      <SidebarGroupContent>
        <TmuxSessionsPanel filterProjectPath={project?.path} />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function OverviewTab({ slug }: { slug: string | null }) {
  if (!slug) {
    return (
      <div className="px-2 py-4 text-center text-xs text-muted-foreground">
        Open a project to see overview
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 py-2">
      {/* Git worktrees (only visible when 2+ worktrees exist) */}
      <WorktreeInfoSection slug={slug} />

      {/* Active tmux sessions */}
      <TmuxSection slug={slug} />

      {/* Integrations */}
      <IntegrationsSection slug={slug} />

      {/* Activity feed */}
      <ActivityFeed slug={slug} />
    </div>
  );
}
