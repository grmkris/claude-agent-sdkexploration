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
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppBreadcrumb } from "@/components/app-breadcrumb";
import { ProjectExplorerPanel } from "@/components/project-explorer-panel";
import { PushNotificationManager } from "@/components/push-notification-manager";
import { SshBadge } from "@/components/ssh-badge";
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

export function ProjectSidebar() {
  const pathname = usePathname();
  const projectSlug = extractProjectSlug(pathname);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b p-0">
        <div className="flex h-9 items-center gap-1.5 px-2">
          <SidebarTrigger className="-ml-0.5 shrink-0" />
          <div className="group-data-[collapsible=icon]:hidden min-w-0 flex-1">
            <AppBreadcrumb />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {projectSlug ? (
          /* ── Project view: 5-tab explorer ──────────────── */
          <ProjectExplorerPanel key={projectSlug} slug={projectSlug} />
        ) : (
          /* ── Root view: global navigation ─────────────── */
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {GLOBAL_NAV.map(({ href, label, tooltip, icon }) => (
                  <SidebarMenuItem key={href}>
                    <Link href={href}>
                      <SidebarMenuButton
                        isActive={href === "/" ? pathname === "/" : pathname === href}
                        tooltip={tooltip}
                      >
                        <HugeiconsIcon icon={icon} size={15} strokeWidth={2} />
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
        )}
      </SidebarContent>

      <SidebarFooter>
        <div className="group-data-[collapsible=icon]:hidden px-1 pb-1">
          <SshBadge />
        </div>
        <PushNotificationManager />
      </SidebarFooter>
    </Sidebar>
  );
}
