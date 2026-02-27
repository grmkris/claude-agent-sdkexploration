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
import { usePathname } from "next/navigation";

import { AppBreadcrumb } from "@/components/app-breadcrumb";
import { CursorLogo } from "@/components/open-in-cursor-button";
import { ProjectExplorerPanel } from "@/components/project-explorer-panel";
import { PushNotificationManager } from "@/components/push-notification-manager";
import { TmuxLauncher } from "@/components/tmux-launcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
 * Project-name header with a dropdown for Cursor + Tmux actions.
 * Replaces the plain breadcrumb when a project is open.
 */
function ProjectHeader({ slug }: { slug: string }) {
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const { data: serverConfig } = useQuery(orpc.server.config.queryOptions());
  const project = projects?.find((p) => p.slug === slug);
  const projectName = project
    ? project.path.split("/").at(-1)
    : slug.replace(/-/g, " ");
  const cursorUrl = project?.path
    ? generateCursorUrl(project.path, serverConfig?.sshHost)
    : null;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger className="group flex min-w-0 flex-1 items-center gap-1 rounded-sm px-1 py-0.5 text-xs font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
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
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start" className="w-52">
          <DropdownMenuLabel>{projectName}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {cursorUrl && (
            <DropdownMenuItem
              render={
                <a href={cursorUrl} onClick={(e) => e.stopPropagation()} />
              }
            >
              <CursorLogo className="h-3.5 w-3.5 shrink-0" />
              Open in Cursor
            </DropdownMenuItem>
          )}
          {project?.path && (
            <Popover>
              <PopoverTrigger className="focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-none px-2 py-2 text-xs outline-hidden select-none hover:bg-accent hover:text-accent-foreground">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 shrink-0"
                >
                  <rect width="20" height="14" x="2" y="3" rx="2" />
                  <path d="m8 10 2 2-2 2" />
                  <path d="M12 14h4" />
                </svg>
                Launch Tmux
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="start"
                sideOffset={8}
                className="w-80 p-3"
              >
                <div className="mb-2.5 text-xs font-medium">
                  Launch Tmux Session
                </div>
                <TmuxLauncher slug={slug} projectPath={project.path} />
              </PopoverContent>
            </Popover>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
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
