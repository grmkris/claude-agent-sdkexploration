"use client";

import {
  Analytics01Icon,
  ComputerTerminal01Icon,
  Home01Icon,
  Key01Icon,
  Mail01Icon,
  McpServerIcon,
  TimeScheduleIcon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { AppBreadcrumb } from "@/components/app-breadcrumb";
import { CursorLogo } from "@/components/open-in-cursor-button";
import { ProjectExplorerPanel } from "@/components/project-explorer-panel";
import { PushNotificationManager } from "@/components/push-notification-manager";
import { TmuxLauncher } from "@/components/tmux-launcher";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { generateCursorUrl } from "@/lib/cursor-urls";
import { orpc } from "@/lib/orpc";

const GLOBAL_NAV = [
  {
    href: "/",
    label: "Home",
    tooltip: "Home",
    icon: Home01Icon,
  },
  {
    href: "/analytics",
    label: "Analytics",
    tooltip: "Usage analytics",
    icon: Analytics01Icon,
  },
  {
    href: "/keys",
    label: "Keys",
    tooltip: "API Key Vault",
    icon: Key01Icon,
  },
  {
    href: "/mcps",
    label: "MCPs",
    tooltip: "MCP Servers & Skills",
    icon: McpServerIcon,
  },
  {
    href: "/email",
    label: "Email",
    tooltip: "Email Config",
    icon: Mail01Icon,
  },
  {
    href: "/webhooks",
    label: "Webhooks",
    tooltip: "Webhooks",
    icon: WebhookIcon,
  },
  {
    href: "/crons",
    label: "Crons",
    tooltip: "Cron Jobs",
    icon: TimeScheduleIcon,
  },
  {
    href: "/tmux",
    label: "Tmux",
    tooltip: "Tmux Sessions",
    icon: ComputerTerminal01Icon,
  },
] as const;

/** Extract project slug from paths like /project/[slug] or /project/[slug]/chat/[id] */
function extractProjectSlug(pathname: string): string | null {
  const match = pathname.match(/^\/project\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Project-name header with two popovers:
 *  1. Project switcher — lists all projects with search, click to navigate.
 *  2. Tools button — Cursor link + Tmux launcher.
 *
 * Replaces the previous DropdownMenu approach which crashed because Base UI
 * does not support a Popover nested inside a Menu.Popup.
 */
function ProjectHeader({ slug }: { slug: string }) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const { data: serverConfig } = useQuery(orpc.server.config.queryOptions());
  const project = projects?.find((p) => p.slug === slug);
  const projectName = project
    ? project.path.split("/").at(-1)
    : slug.replace(/-/g, " ");
  const cursorUrl = project?.path
    ? generateCursorUrl(project.path, serverConfig?.sshHost)
    : null;

  const filtered = (projects ?? []).filter((p) => {
    const name = p.path.split("/").at(-1) ?? p.slug;
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {/* ── 1. Project switcher ── */}
      <Popover>
        <PopoverTrigger className="group flex min-w-0 flex-1 items-center gap-1 rounded-sm px-1 py-0.5 text-xs font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <span className="truncate">{projectName}</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3 shrink-0 text-muted-foreground transition-transform group-data-open:rotate-180"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={4}
          className="w-56 p-1.5"
        >
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="mb-1 w-full rounded bg-muted/50 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
          />
          {/* Project list */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.map((p) => {
              const name = p.path.split("/").at(-1) ?? p.slug;
              const isCurrent = p.slug === slug;
              return (
                <button
                  key={p.slug}
                  onClick={() => router.push(`/project/${p.slug}`)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <span className="flex-1 truncate text-left">{name}</span>
                  {isCurrent && (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3 w-3 shrink-0 text-primary"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No projects found
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* ── 2. Tools button (Cursor + Tmux) ── */}
      {project?.path && (
        <Popover>
          <PopoverTrigger className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            {/* Terminal / tools icon */}
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
            side="bottom"
            align="end"
            sideOffset={4}
            className="w-80 p-3"
          >
            {/* Cursor link */}
            {cursorUrl && (
              <>
                <a
                  href={cursorUrl}
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <CursorLogo className="h-3.5 w-3.5 shrink-0" />
                  Open in Cursor
                </a>
                <div className="my-2 border-t" />
              </>
            )}
            {/* Tmux launcher */}
            <div className="mb-2.5 text-xs font-medium">
              Launch Tmux Session
            </div>
            <TmuxLauncher slug={slug} projectPath={project.path} />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export function ProjectSidebar() {
  const pathname = usePathname();
  const projectSlug = extractProjectSlug(pathname);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b p-0">
        <div className="flex h-9 items-center gap-1.5 px-2">
          <SidebarTrigger className="-ml-0.5 shrink-0" />
          <div className="group-data-[collapsible=icon]:hidden min-w-0 flex-1">
            {projectSlug ? (
              <ProjectHeader slug={projectSlug} />
            ) : (
              <AppBreadcrumb />
            )}
          </div>
        </div>
      </SidebarHeader>

      {projectSlug ? (
        /* ── Project view: panel manages its own SidebarContent + SidebarFooter ── */
        <ProjectExplorerPanel key={projectSlug} slug={projectSlug} />
      ) : (
        /* ── Root view: global navigation ─────────────── */
        <>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {GLOBAL_NAV.map(({ href, label, tooltip, icon }) => (
                    <SidebarMenuItem key={href}>
                      <Link href={href}>
                        <SidebarMenuButton
                          isActive={
                            href === "/" ? pathname === "/" : pathname === href
                          }
                          tooltip={tooltip}
                        >
                          <HugeiconsIcon
                            icon={icon}
                            size={15}
                            strokeWidth={2}
                          />
                          <span className="group-data-[collapsible=icon]:hidden">
                            {label}
                          </span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="group-data-[collapsible=icon]:hidden px-2 pb-1">
              <PushNotificationManager />
            </div>
          </SidebarFooter>
        </>
      )}
    </Sidebar>
  );
}
