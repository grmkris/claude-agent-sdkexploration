"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { OpenInCursorButton } from "@/components/open-in-cursor-button";
import { IntegrationWidgets } from "@/components/project-integrations";
import { WorktreeInfoSection } from "@/components/right-sidebar/worktree-info-section";
import { TmuxLauncher } from "@/components/tmux-launcher";
import { TmuxSessionsPanel } from "@/components/tmux-sessions-panel";
import { Button } from "@/components/ui/button";
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

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

// ── Tmux sessions scoped to this project ─────────────────────────────────────

function ProjectTmuxSection({ slug }: { slug: string }) {
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const project = projects?.find((p) => p.slug === slug);

  // TmuxSessionsPanel returns null when there's nothing to show
  return (
    <SidebarGroup>
      <div className="px-2 pb-1 text-[11px] font-medium text-sidebar-foreground/70">
        Tmux Sessions
      </div>
      <SidebarGroupContent>
        <TmuxSessionsPanel filterProjectPath={project?.path} />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// ── Tmux session launcher ─────────────────────────────────────────────────────

function TmuxLauncherSection({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const project = projects?.find((p) => p.slug === slug);

  return (
    <SidebarGroup>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-2 pb-1 text-[11px] font-medium text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
      >
        <span>Launch Tmux Session</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <SidebarGroupContent>
          <TmuxLauncher slug={slug} projectPath={project?.path ?? null} />
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function OverviewTab({ slug }: { slug: string | null }) {
  const router = useRouter();

  if (!slug) {
    return (
      <div className="px-2 py-4 text-center text-xs text-muted-foreground">
        Open a project to see overview
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 py-2">
      {/* New conversation — always navigates with a fresh ?_new=<timestamp> so
          Next.js treats it as a new URL even when already on /project/[slug]/chat,
          and the chat page uses that param as a React key to force a full remount. */}
      <div className="px-2">
        <Button
          size="sm"
          className="w-full"
          onClick={() =>
            router.push(`/project/${slug}/chat?_new=${Date.now()}`)
          }
        >
          New Conversation
        </Button>
      </div>

      {/* Open in Cursor */}
      <ProjectCursorSection slug={slug} />

      {/* Git worktrees (only visible when 2+ worktrees exist) */}
      <WorktreeInfoSection slug={slug} />

      {/* Tmux sessions scoped to this project */}
      <ProjectTmuxSection slug={slug} />

      {/* Multi-pane tmux session launcher */}
      <TmuxLauncherSection slug={slug} />

      {/* Integrations */}
      <IntegrationsSection slug={slug} />
    </div>
  );
}
