"use client";

import {
  Clock01Icon,
  CommandLineIcon,
  LayerIcon,
  Mail01Icon,
  Message01Icon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SessionActionsMenu } from "@/components/session-actions-menu";
import { SessionStateBadge } from "@/components/session-state-badge";
import {
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { orpc } from "@/lib/orpc";
import { cn, getTimeAgo } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Source config
// ---------------------------------------------------------------------------

type SourceFilter =
  | "cron"
  | "email"
  | "webhook"
  | "chat"
  | "linear_chat"
  | "cli";

interface SourceConfig {
  label: string;
  icon: IconSvgElement;
  /** DB `source` values that map to this filter bucket */
  values: Array<string | null>;
  color: string;
}

const SOURCE_CONFIGS: Record<SourceFilter, SourceConfig> = {
  cron: {
    label: "Cron",
    icon: Clock01Icon,
    values: ["cron"],
    color: "text-amber-500",
  },
  email: {
    label: "Email",
    icon: Mail01Icon,
    values: ["email"],
    color: "text-blue-500",
  },
  webhook: {
    label: "Webhook",
    icon: WebhookIcon,
    values: ["webhook"],
    color: "text-violet-500",
  },
  chat: {
    label: "Chat",
    icon: Message01Icon,
    values: ["chat", "root_chat"],
    color: "text-emerald-500",
  },
  linear_chat: {
    label: "Linear",
    icon: LayerIcon,
    values: ["linear_chat"],
    color: "text-indigo-500",
  },
  cli: {
    label: "CLI",
    icon: CommandLineIcon,
    values: [null],
    color: "text-muted-foreground",
  },
};

const ALL_FILTERS = Object.keys(SOURCE_CONFIGS) as SourceFilter[];

/** Return the SourceFilter bucket for a raw source string (or null). */
function getSourceFilter(source: string | null | undefined): SourceFilter {
  for (const [key, cfg] of Object.entries(SOURCE_CONFIGS)) {
    if (cfg.values.includes(source ?? null)) {
      return key as SourceFilter;
    }
  }
  return "cli";
}

// ---------------------------------------------------------------------------
// SourceIcon — tiny inline icon shown on each session row
// ---------------------------------------------------------------------------

function SourceIcon({ source }: { source: string | null | undefined }) {
  const bucket = getSourceFilter(source);
  const { icon, color, label } = SOURCE_CONFIGS[bucket];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <span className={cn("inline-flex items-center", color)}>
            <HugeiconsIcon icon={icon} size={10} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// FilterChip
// ---------------------------------------------------------------------------

function FilterChip({
  filter,
  active,
  onToggle,
}: {
  filter: SourceFilter;
  active: boolean;
  onToggle: (f: SourceFilter) => void;
}) {
  const { label, icon, color } = SOURCE_CONFIGS[filter];

  return (
    <button
      onClick={() => onToggle(filter)}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <HugeiconsIcon
        icon={icon}
        size={10}
        className={active ? "text-primary-foreground" : color}
      />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// SessionsPanel
// ---------------------------------------------------------------------------

/**
 * Reusable sessions list panel. Used in:
 * - Left sidebar (root view): shows all sessions
 * - Right sidebar (project view): shows sessions for current project
 */
export function SessionsPanel({
  filterSlug,
  showProjectLabel = true,
}: {
  filterSlug?: string;
  showProjectLabel?: boolean;
}) {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const queryInput = { limit: 50, ...(filterSlug ? { slug: filterSlug } : {}) };

  const { data: sessions, isLoading } = useQuery({
    ...orpc.sessions.timeline.queryOptions({ input: queryInput }),
    refetchInterval: 15000,
  });

  const archiveMutation = useMutation({
    ...orpc.sessions.archive.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries(
        orpc.sessions.timeline.queryOptions({ input: queryInput })
      );
    },
  });

  // Active source filters (empty = show all)
  const [activeFilters, setActiveFilters] = useState<SourceFilter[]>([]);

  function toggleFilter(f: SourceFilter) {
    setActiveFilters((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  }

  // Only show chips for source buckets that actually exist in the current list
  const presentFilters = sessions
    ? ALL_FILTERS.filter((f) =>
        sessions.some((s) => getSourceFilter(s.source) === f)
      )
    : [];

  // Apply client-side filter
  const filtered =
    activeFilters.length === 0
      ? (sessions ?? [])
      : (sessions ?? []).filter((s) =>
          activeFilters.includes(getSourceFilter(s.source))
        );

  return (
    <SidebarGroupContent>
      {/* Filter chips — only render when 2+ distinct source types are present */}
      {presentFilters.length > 1 && (
        <div className="px-2 pb-1.5 pt-0.5 flex flex-wrap gap-1">
          {presentFilters.map((f) => (
            <FilterChip
              key={f}
              filter={f}
              active={activeFilters.includes(f)}
              onToggle={toggleFilter}
            />
          ))}
          {activeFilters.length > 0 && (
            <button
              onClick={() => setActiveFilters([])}
              className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <SidebarMenu>
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuSkeleton />
            </SidebarMenuItem>
          ))}

        {filtered.map((session) => {
          const sessionUrl = session.projectSlug
            ? `/project/${session.projectSlug}/chat/${session.id}`
            : `/chat/${session.id}`;
          const isSelected = pathname === sessionUrl;
          // Use the project folder name (last path segment) as the label,
          // consistent with the home-page sessions list. Root-workspace
          // sessions (no projectSlug) show "root".
          const projectLabel = session.projectSlug
            ? (session.projectPath.split("/").pop() ?? session.projectSlug)
            : "root";

          const timeAgo = getTimeAgo(session.lastModified ?? session.timestamp);

          return (
            <SidebarMenuItem key={session.id}>
              <div className="group flex items-center">
                <Link href={sessionUrl} className="min-w-0 flex-1">
                  <SidebarMenuButton
                    isActive={isSelected}
                    tooltip={session.firstPrompt}
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">
                        {session.firstPrompt}
                      </span>
                      <span className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                        {showProjectLabel ? `${projectLabel} · ` : ""}
                        {timeAgo}
                        <SourceIcon source={session.source} />
                      </span>
                    </div>
                  </SidebarMenuButton>
                </Link>
                <div className="ml-auto flex shrink-0 items-center gap-1 pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <SessionStateBadge sessionId={session.id} compact />
                  <SessionActionsMenu
                    session={{
                      sessionId: session.id,
                      resumeCommand: session.resumeCommand,
                    }}
                    onArchive={() =>
                      archiveMutation.mutate({ sessionId: session.id })
                    }
                  />
                </div>
              </div>
            </SidebarMenuItem>
          );
        })}

        {!isLoading && filtered.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            {activeFilters.length > 0
              ? "No sessions match the selected filters"
              : "No sessions yet"}
          </div>
        )}
      </SidebarMenu>
    </SidebarGroupContent>
  );
}
