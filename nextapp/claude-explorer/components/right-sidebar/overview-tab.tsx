"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { OpenInCursorButton } from "@/components/open-in-cursor-button";
import { IntegrationWidgets } from "@/components/project-integrations";
import { Button } from "@/components/ui/button";
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
      {/* New conversation */}
      <div className="px-2">
        <Link href={`/project/${slug}/chat`}>
          <Button size="sm" className="w-full">
            New Conversation
          </Button>
        </Link>
      </div>

      {/* Open in Cursor */}
      <ProjectCursorSection slug={slug} />

      {/* Integrations */}
      <IntegrationsSection slug={slug} />
    </div>
  );
}
