"use client";

import type { IconSvgElement } from "@hugeicons/react";
import type { RecentSession } from "@/lib/types";

import {
  Archive01Icon,
  ArchiveIcon,
  ArrowDown01Icon,
  Clock01Icon,
  LayerIcon,
  Layout01Icon,
  Mail01Icon,
  UserIcon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SessionActionsMenu } from "@/components/session-actions-menu";
import { SessionPreviewPopover } from "@/components/session-preview-popover";
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

type SourceFilter = "cron" | "email" | "webhook" | "linear_chat" | "manual";

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
  linear_chat: {
    label: "Linear",
    icon: LayerIcon,
    values: ["linear_chat"],
    color: "text-indigo-500",
  },
  // "manual" catches everything a human started themselves — web UI (chat /
  // root_chat) or directly from the terminal (null source).
  manual: {
    label: "Manual",
    icon: UserIcon,
    values: ["chat", "root_chat", null],
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
  return "manual";
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
// SessionRow — shared session row renderer (proper component so hooks are ok)
// ---------------------------------------------------------------------------

function SessionRow({
  session,
  showProjectLabel,
  onArchive,
  dimmed = false,
  unarchiveButton,
}: {
  session: RecentSession;
  showProjectLabel: boolean;
  onArchive: () => void;
  dimmed?: boolean;
  unarchiveButton?: React.ReactNode;
}) {
  const pathname = usePathname();

  const sessionUrl = session.projectSlug
    ? `/project/${session.projectSlug}/chat/${session.id}`
    : `/chat/${session.id}`;
  const isSelected = pathname === sessionUrl;
  const projectLabel = session.projectSlug
    ? (session.projectPath.split("/").pop() ?? session.projectSlug)
    : "root";
  const timeAgo = getTimeAgo(session.lastModified ?? session.timestamp);

  return (
    <SidebarMenuItem>
      <SessionPreviewPopover
        sessionId={session.id}
        slug={session.projectSlug ?? "root"}
        firstPrompt={session.firstPrompt}
        lastModified={session.lastModified}
        timestamp={session.timestamp}
        model={session.model}
      >
        <div className={cn("group flex items-center", dimmed && "opacity-60 hover:opacity-100 transition-opacity")}>
          <Link href={sessionUrl} className="min-w-0 flex-1">
            <SidebarMenuButton isActive={isSelected} tooltip={session.firstPrompt}>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{session.firstPrompt}</span>
                <span className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                  {showProjectLabel ? `${projectLabel} · ` : ""}
                  {timeAgo}
                  <SourceIcon source={session.source} />
                </span>
              </div>
            </SidebarMenuButton>
          </Link>
          {unarchiveButton ?? (
            <div className="ml-auto flex shrink-0 items-center pr-1">
              <SessionStateBadge sessionId={session.id} compact />
            </div>
          )}
        </div>
      </SessionPreviewPopover>
    </SidebarMenuItem>
  );
}

// ---------------------------------------------------------------------------
// ProjectGroup — collapsible group header + sessions
// ---------------------------------------------------------------------------

function ProjectGroup({
  label,
  sessions,
  defaultOpen = true,
  onArchive,
}: {
  label: string;
  sessions: RecentSession[];
  defaultOpen?: boolean;
  onArchive: (sessionId: string) => void;
}) {
  const hasActive = sessions.some((s) => s.sessionState === "active");
  const [open, setOpen] = useState(defaultOpen || hasActive);
  // Active groups are always forced open
  const isOpen = hasActive || open;

  return (
    <div>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-1 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors select-none"
      >
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={10}
          className={cn(
            "transition-transform duration-150 shrink-0",
            !isOpen && "-rotate-90"
          )}
        />
        <span className="truncate">{label}</span>
        <span className="ml-auto shrink-0 tabular-nums opacity-60">
          {sessions.length}
        </span>
      </button>
      {isOpen && (
        <SidebarMenu>
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              showProjectLabel={false}
              onArchive={() => onArchive(session.id)}
            />
          ))}
        </SidebarMenu>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionsPanel
// ---------------------------------------------------------------------------

/**
 * Reusable sessions list panel. Used in:
 * - Right sidebar (root view): shows all sessions across all projects
 * - Right sidebar (project view): shows sessions for current project
 */
export function SessionsPanel({
  filterSlug,
  showProjectLabel = true,
}: {
  filterSlug?: string;
  showProjectLabel?: boolean;
}) {
  const queryClient = useQueryClient();

  const queryInput = { limit: 50, ...(filterSlug ? { slug: filterSlug } : {}) };

  const { data: sessions, isLoading } = useQuery({
    ...orpc.sessions.timeline.queryOptions({ input: queryInput }),
    refetchInterval: 15000,
  });

  const archiveMutation = useMutation({
    ...orpc.sessions.archive.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orpc.sessions.timeline.queryOptions({ input: queryInput })
          .queryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: orpc.sessions.timeline.queryOptions({
          input: { ...queryInput, includeArchived: true },
        }).queryKey,
      });
    },
  });

  // Archived sessions toggle and query
  const [showArchived, setShowArchived] = useState(false);

  const { data: archivedSessions, isLoading: archivedLoading } = useQuery({
    ...orpc.sessions.timeline.queryOptions({
      input: { ...queryInput, includeArchived: true },
    }),
    enabled: showArchived,
    refetchInterval: showArchived ? 30000 : false,
  });

  const unarchiveMutation = useMutation({
    ...orpc.sessions.archive.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orpc.sessions.timeline.queryOptions({
          input: { ...queryInput, includeArchived: true },
        }).queryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: orpc.sessions.timeline.queryOptions({ input: queryInput })
          .queryKey,
      });
    },
  });

  // Active source filters (empty = show all)
  const [activeFilters, setActiveFilters] = useState<SourceFilter[]>([]);

  // Project filter — only active when in the all-projects (root) view
  const [projectFilter, setProjectFilter] = useState<string>("__all__");

  // Group by project toggle — only active in the root view
  const [groupByProject, setGroupByProject] = useState(false);

  // Projects list — only fetched in the root view
  const { data: projects = [] } = useQuery({
    ...orpc.projects.list.queryOptions(),
    enabled: !filterSlug,
    staleTime: 30_000,
  });

  const isRootView = !filterSlug;

  function toggleFilter(f: SourceFilter) {
    setActiveFilters((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  }

  // Only show source chips for buckets that actually exist in the current list
  const presentFilters = sessions
    ? ALL_FILTERS.filter((f) =>
        sessions.some((s) => getSourceFilter(s.source) === f)
      )
    : [];

  // Apply project dropdown filter (root view only)
  const projectFiltered =
    isRootView && projectFilter !== "__all__"
      ? (sessions ?? []).filter((s) => s.projectSlug === projectFilter)
      : (sessions ?? []);

  // Apply source filter
  const filtered =
    activeFilters.length === 0
      ? projectFiltered
      : projectFiltered.filter((s) =>
          activeFilters.includes(getSourceFilter(s.source))
        );

  // Build groups for grouped view (root view only)
  const groups: Array<{ key: string; label: string; sessions: RecentSession[] }> =
    (() => {
      if (!groupByProject || !isRootView) return [];

      const map = new Map<string, { label: string; sessions: RecentSession[] }>();
      for (const session of filtered) {
        const key = session.projectSlug ?? "__root__";
        const label = session.projectSlug
          ? (session.projectPath.split("/").pop() ?? session.projectSlug)
          : "root";
        if (!map.has(key)) map.set(key, { label, sessions: [] });
        map.get(key)!.sessions.push(session);
      }

      // Sort groups by most recent session (sessions already come ordered by updated_at desc)
      return Array.from(map.entries())
        .map(([key, val]) => ({ key, ...val }))
        .sort((a, b) => {
          const aLatest =
            a.sessions[0]?.lastModified ?? a.sessions[0]?.timestamp ?? "";
          const bLatest =
            b.sessions[0]?.lastModified ?? b.sessions[0]?.timestamp ?? "";
          return bLatest.localeCompare(aLatest);
        });
    })();

  // Sort projects for the dropdown by lastActive desc
  const sortedProjects = [...projects].sort((a, b) => {
    if (!a.lastActive) return 1;
    if (!b.lastActive) return -1;
    return b.lastActive.localeCompare(a.lastActive);
  });

  const noResults =
    activeFilters.length > 0 || (isRootView && projectFilter !== "__all__")
      ? "No sessions match the selected filters"
      : "No sessions yet";

  return (
    <SidebarGroupContent>
      {/* Root-view toolbar: project filter dropdown + group-by toggle */}
      {isRootView && (
        <div className="px-2 pb-1.5 pt-0.5 flex items-center gap-1.5">
          {/* Project filter dropdown */}
          <div className="relative flex-1 min-w-0">
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className={cn(
                "w-full appearance-none rounded border border-border bg-background pl-2 pr-6 py-0.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer truncate",
                projectFilter !== "__all__" &&
                  "border-primary text-primary font-medium"
              )}
            >
              <option value="__all__">All projects</option>
              {sortedProjects.map((p) => {
                const label = p.path.split("/").pop() ?? p.slug;
                return (
                  <option key={p.slug} value={p.slug}>
                    {label}
                  </option>
                );
              })}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-muted-foreground">
              <HugeiconsIcon icon={ArrowDown01Icon} size={10} />
            </span>
          </div>

          {/* Group by project toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    onClick={() => setGroupByProject((prev) => !prev)}
                    className={cn(
                      "flex items-center justify-center rounded p-1 transition-colors shrink-0",
                      groupByProject
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  />
                }
              >
                <HugeiconsIcon icon={Layout01Icon} size={12} />
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                {groupByProject ? "Ungroup" : "Group by project"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      {/* Source filter chips — only render when 2+ distinct source types are present */}
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

      {/* Grouped view */}
      {groupByProject && isRootView ? (
        <div>
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-3 py-1">
                <SidebarMenuSkeleton />
              </div>
            ))}

          {!isLoading && groups.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              {noResults}
            </div>
          )}

          {groups.map((group, i) => (
            <ProjectGroup
              key={group.key}
              label={group.label}
              sessions={group.sessions}
              defaultOpen={i === 0}
              onArchive={(sessionId) => archiveMutation.mutate({ sessionId })}
            />
          ))}
        </div>
      ) : (
        /* Flat view */
        <SidebarMenu>
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <SidebarMenuItem key={i}>
                <SidebarMenuSkeleton />
              </SidebarMenuItem>
            ))}

          {filtered.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              showProjectLabel={showProjectLabel}
              onArchive={() => archiveMutation.mutate({ sessionId: session.id })}
            />
          ))}

          {!isLoading && filtered.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              {noResults}
            </div>
          )}
        </SidebarMenu>
      )}

      {/* Archived section toggle */}
      <div className="mt-1 px-2">
        <button
          onClick={() => setShowArchived((prev) => !prev)}
          className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <HugeiconsIcon icon={ArchiveIcon} size={10} />
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      </div>

      {showArchived && (
        <SidebarMenu>
          {archivedLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <SidebarMenuItem key={i}>
                <SidebarMenuSkeleton />
              </SidebarMenuItem>
            ))}

          {!archivedLoading && (archivedSessions ?? []).length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              No archived conversations
            </div>
          )}

          {(archivedSessions ?? []).map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              showProjectLabel={showProjectLabel}
              onArchive={() => {}}
              dimmed
              unarchiveButton={
                <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100 transition-opacity pr-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            onClick={() =>
                              unarchiveMutation.mutate({
                                sessionId: session.id,
                                archived: false,
                              })
                            }
                            className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                          />
                        }
                      >
                        <HugeiconsIcon icon={Archive01Icon} size={12} />
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-xs">
                        Unarchive
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              }
            />
          ))}
        </SidebarMenu>
      )}
    </SidebarGroupContent>
  );
}
