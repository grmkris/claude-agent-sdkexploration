"use client";

import { useQuery } from "@tanstack/react-query";

import { OpenInCursorButton } from "@/components/open-in-cursor-button";
import { IntegrationWidgets } from "@/components/project-integrations";
import { WorktreeInfoSection } from "@/components/right-sidebar/worktree-info-section";
import { TmuxLauncher } from "@/components/tmux-launcher";
import { TmuxSessionsPanel } from "@/components/tmux-sessions-panel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
      <div className="px-2 pb-1 text-[11px] font-medium text-sidebar-foreground/70">
        Integrations
      </div>
      <SidebarGroupContent>
        <div className="flex flex-col gap-3 px-2">
          {projectIntegrations.map((integration) => (
            <div key={integration.id}>
              <div className="mb-1 text-[10px] capitalize text-muted-foreground">
                {integration.type} · {integration.name}
              </div>
              <IntegrationWidgets integrationId={integration.id} />
            </div>
          ))}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// ── Open in Cursor ───────────────────────────────────────────────────────────

function ProjectCursorSection({ slug }: { slug: string }) {
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const { data: serverConfig } = useQuery(orpc.server.config.queryOptions());

  const project = projects?.find((p) => p.slug === slug);
  if (!project?.path) return null;

  return (
    <div className="px-2">
      <OpenInCursorButton
        path={project.path}
        sshHost={serverConfig?.sshHost}
        className="w-full justify-center"
      />
    </div>
  );
}

// ── Tmux: sessions list + popover launcher ────────────────────────────────────

function TmuxSection({ slug }: { slug: string }) {
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const project = projects?.find((p) => p.slug === slug);

  return (
    <SidebarGroup>
      {/* Header: label + launch popover trigger */}
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-[11px] font-medium text-sidebar-foreground/70">
          Tmux Sessions
        </span>
        <Popover>
          <PopoverTrigger
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            title="Launch new tmux session"
          >
            {/* Terminal icon */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <rect width="20" height="14" x="2" y="3" rx="2" />
              <path d="m8 10 2 2-2 2" />
              <path d="M12 14h4" />
            </svg>
          </PopoverTrigger>
          <PopoverContent
            side="left"
            align="start"
            sideOffset={8}
            className="w-80 p-3"
          >
            <div className="mb-2.5 text-xs font-medium">
              Launch Tmux Session
            </div>
            <TmuxLauncher slug={slug} projectPath={project?.path ?? null} />
          </PopoverContent>
        </Popover>
      </div>

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
      {/* Open in Cursor */}
      <ProjectCursorSection slug={slug} />

      {/* Git worktrees (only visible when 2+ worktrees exist) */}
      <WorktreeInfoSection slug={slug} />

      {/* Tmux sessions + launch popover */}
      <TmuxSection slug={slug} />

      {/* Integrations */}
      <IntegrationsSection slug={slug} />
    </div>
  );
}
