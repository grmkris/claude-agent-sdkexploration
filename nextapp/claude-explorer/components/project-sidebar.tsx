"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ProjectExplorerPanel } from "@/components/project-explorer-panel";
import { PushNotificationManager } from "@/components/push-notification-manager";
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
} from "@/components/ui/sidebar";

const GLOBAL_NAV = [
  { href: "/analytics", label: "Analytics", tooltip: "Usage analytics" },
  { href: "/keys", label: "Keys", tooltip: "API Key Vault" },
  { href: "/mcps", label: "MCPs", tooltip: "MCP Servers & Skills" },
  { href: "/email", label: "Email", tooltip: "Email Config" },
  { href: "/webhooks", label: "Webhooks", tooltip: "Webhooks" },
  { href: "/crons", label: "Crons", tooltip: "Cron Jobs" },
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
    <Sidebar>
      <SidebarHeader>
        <Link href="/">
          <div className="px-2 py-1 text-sm font-semibold">Claude Explorer</div>
        </Link>
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
                {GLOBAL_NAV.map(({ href, label, tooltip }) => (
                  <SidebarMenuItem key={href}>
                    <Link href={href}>
                      <SidebarMenuButton
                        isActive={pathname === href}
                        tooltip={tooltip}
                      >
                        <span>{label}</span>
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
        <PushNotificationManager />
      </SidebarFooter>
    </Sidebar>
  );
}
