"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ProjectIntegrations } from "@/components/project-integrations";
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";

export function AutomationsTab({ slug }: { slug: string | null }) {
  const { data: crons } = useQuery({
    ...orpc.crons.list.queryOptions(),
    refetchInterval: 30_000,
  });
  const { data: webhooks } = useQuery({
    ...orpc.webhooks.list.queryOptions(),
    refetchInterval: 30_000,
  });

  if (!slug) {
    return (
      <div className="px-2 py-4 text-center text-xs text-muted-foreground">
        Open a project to see automations
      </div>
    );
  }

  const projectCrons =
    crons?.filter((c) => c.projectSlug === slug && c.enabled) ?? [];
  const projectWebhooks =
    webhooks?.filter((w) => w.projectSlug === slug && w.enabled) ?? [];

  return (
    <div className="flex flex-col gap-2 py-2">
      {/* Integrations */}
      <SidebarGroup>
        <ProjectIntegrations slug={slug} />
      </SidebarGroup>

      {/* Crons */}
      <SidebarGroup>
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[11px] font-medium text-sidebar-foreground/70">
            Crons
          </span>
          <Link
            href={`/project/${slug}/crons`}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            manage
          </Link>
        </div>
        <SidebarGroupContent>
          {projectCrons.length === 0 ? (
            <p className="px-2 text-[11px] text-muted-foreground">
              No active crons.{" "}
              <Link
                href={`/project/${slug}/crons`}
                className="hover:text-foreground underline"
              >
                Add one
              </Link>
            </p>
          ) : (
            <div className="flex flex-col gap-1 px-2 text-[11px] text-muted-foreground">
              {projectCrons.map((cron) => (
                <div
                  key={cron.id}
                  className="flex items-center justify-between"
                >
                  <span className="truncate text-green-400">
                    {cron.prompt.slice(0, 40)}
                  </span>
                  <span className="ml-2 shrink-0 font-mono text-[10px]">
                    {cron.expression}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Webhooks */}
      <SidebarGroup>
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[11px] font-medium text-sidebar-foreground/70">
            Webhooks
          </span>
          <Link
            href={`/project/${slug}/webhooks`}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            manage
          </Link>
        </div>
        <SidebarGroupContent>
          {projectWebhooks.length === 0 ? (
            <p className="px-2 text-[11px] text-muted-foreground">
              No active webhooks.{" "}
              <Link
                href={`/project/${slug}/webhooks`}
                className="hover:text-foreground underline"
              >
                Add one
              </Link>
            </p>
          ) : (
            <div className="flex flex-col gap-1 px-2 text-[11px] text-muted-foreground">
              {projectWebhooks.map((wh) => (
                <div key={wh.id} className="flex items-center justify-between">
                  <span className="truncate">{wh.name}</span>
                  <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                    {wh.provider}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Email */}
      <SidebarGroup>
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[11px] font-medium text-sidebar-foreground/70">
            Email
          </span>
          <Link
            href={`/project/${slug}/email`}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            manage
          </Link>
        </div>
        <SidebarGroupContent>
          <p className="px-2 text-[11px] text-muted-foreground">
            <Link
              href={`/project/${slug}/email`}
              className="hover:text-foreground underline"
            >
              Configure email
            </Link>
          </p>
        </SidebarGroupContent>
      </SidebarGroup>
    </div>
  );
}
