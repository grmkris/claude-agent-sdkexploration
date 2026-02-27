"use client";

import {
  Add01Icon,
  Clock01Icon,
  ComputerTerminal01Icon,
  LayerIcon,
  Mail01Icon,
  Message01Icon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { SessionsPanel } from "@/components/sessions-panel";
import { Button } from "@/components/ui/button";
import { useRightSidebar } from "@/components/ui/right-sidebar-context";
import { RightSidebarTrigger } from "@/components/ui/right-sidebar-trigger";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { orpc } from "@/lib/orpc";
import { getTimeAgo } from "@/lib/utils";

const RIGHT_SIDEBAR_WIDTH = "17rem";
const RIGHT_SIDEBAR_WIDTH_ICON = "3rem";
const RIGHT_SIDEBAR_WIDTH_MOBILE = "18rem";

/** Extract project slug from paths like /project/[slug] or /project/[slug]/… */
function extractSlug(pathname: string): string | null {
  const match = pathname.match(/^\/project\/([^/]+)/);
  return match ? match[1] : null;
}

function sourceIcon(source: string | null | undefined) {
  if (source === "cron") return Clock01Icon;
  if (source === "email") return Mail01Icon;
  if (source === "webhook") return WebhookIcon;
  if (source === "chat" || source === "root_chat") return Message01Icon;
  if (source === "linear_chat") return LayerIcon;
  return ComputerTerminal01Icon;
}

function sourceColor(source: string | null | undefined): string {
  if (source === "cron") return "text-amber-500";
  if (source === "email") return "text-blue-500";
  if (source === "webhook") return "text-violet-500";
  if (source === "chat" || source === "root_chat") return "text-emerald-500";
  if (source === "linear_chat") return "text-indigo-500";
  return "text-muted-foreground";
}

/** Narrow icon rail shown when the right sidebar is collapsed */
function CollapsedRightSidebar({ activeSlug }: { activeSlug: string | null }) {
  const router = useRouter();

  const { data: sessions = [] } = useQuery({
    ...orpc.sessions.timeline.queryOptions({
      input: { limit: 8, ...(activeSlug ? { slug: activeSlug } : {}) },
    }),
    refetchInterval: 15_000,
  });

  return (
    <div className="bg-sidebar flex size-full flex-col items-center gap-0.5 py-1">
      {/* Expand trigger */}
      <RightSidebarTrigger />

      <div className="my-0.5 w-5 border-t border-border/50" />

      {/* New conversation */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() =>
                router.push(
                  activeSlug
                    ? `/project/${activeSlug}/chat?_new=${Date.now()}`
                    : "/chat"
                )
              }
            />
          }
        >
          <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={2} />
          <span className="sr-only">New Conversation</span>
        </TooltipTrigger>
        <TooltipContent side="left">New Conversation</TooltipContent>
      </Tooltip>

      {sessions.length > 0 && (
        <div className="my-0.5 w-5 border-t border-border/50" />
      )}

      {/* Recent sessions */}
      {sessions.map((session) => {
        const url = session.projectSlug
          ? `/project/${session.projectSlug}/chat/${session.id}`
          : `/chat/${session.id}`;

        const dotColor =
          session.sessionState === "active"
            ? "bg-green-500 animate-pulse"
            : session.sessionState === "idle"
              ? "bg-yellow-400"
              : null;

        return (
          <Tooltip key={session.id}>
            <TooltipTrigger
              render={
                <Link
                  href={url}
                  className="relative flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                />
              }
            >
              <HugeiconsIcon
                icon={sourceIcon(session.source)}
                size={13}
                strokeWidth={2}
                className={sourceColor(session.source)}
              />
              {dotColor && (
                <span
                  className={`absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full ${dotColor}`}
                />
              )}
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[200px]">
              <p className="truncate text-xs font-medium">
                {session.firstPrompt || "Session"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {getTimeAgo(session.lastModified)}
              </p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function RightSidebarInner() {
  const { state } = useRightSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const activeSlug = extractSlug(pathname);

  if (state === "collapsed") {
    return <CollapsedRightSidebar activeSlug={activeSlug} />;
  }

  const label = activeSlug ? "This project" : "All projects";

  return (
    <div className="bg-sidebar flex size-full flex-col">
      <SidebarHeader className="border-b px-2 py-0">
        <div className="flex h-9 items-center gap-1.5">
          <RightSidebarTrigger className="-ml-0.5 shrink-0" />
          <span className="flex-1 text-sm font-semibold">Sessions</span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 px-2 text-xs"
            onClick={() =>
              activeSlug
                ? router.push(`/project/${activeSlug}/chat?_new=${Date.now()}`)
                : router.push("/chat")
            }
          >
            New Conversation
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{label}</SidebarGroupLabel>
          <SessionsPanel
            filterSlug={activeSlug ?? undefined}
            showProjectLabel={!activeSlug}
          />
        </SidebarGroup>
      </SidebarContent>
    </div>
  );
}

export function RightSidebar() {
  const { state, openMobile, setOpenMobile, isMobile } = useRightSidebar();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render anything until client-side mobile detection has resolved.
  // Without this guard, useIsMobile() returns false on first render (SSR),
  // causing the desktop fixed sidebar to mount on mobile — its `fixed` children
  // can escape the parent's `hidden` class and render as a floating icon rail.
  if (!mounted) return null;

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="right"
          data-sidebar="right-sidebar"
          className="bg-sidebar text-sidebar-foreground p-0 [&>button]:hidden"
          style={
            {
              "--sidebar-width": RIGHT_SIDEBAR_WIDTH_MOBILE,
              width: RIGHT_SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sessions</SheetTitle>
            <SheetDescription>
              Recent sessions across all projects.
            </SheetDescription>
          </SheetHeader>
          <RightSidebarInner />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="group peer text-sidebar-foreground hidden md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? "icon" : ""}
      data-variant="sidebar"
      data-side="right"
      style={
        {
          "--sidebar-width": RIGHT_SIDEBAR_WIDTH,
          "--sidebar-width-icon": RIGHT_SIDEBAR_WIDTH_ICON,
        } as React.CSSProperties
      }
    >
      {/* Gap placeholder — shrinks to icon width when collapsed */}
      <div className="relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear group-data-[collapsible=icon]:w-(--sidebar-width-icon)" />

      {/* Fixed panel — narrows to icon width when collapsed, always stays at right-0 */}
      <div
        data-side="right"
        className="fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) border-l transition-[width] duration-200 ease-linear data-[side=right]:right-0 group-data-[collapsible=icon]:w-(--sidebar-width-icon) md:flex"
      >
        <RightSidebarInner />
      </div>
    </div>
  );
}
