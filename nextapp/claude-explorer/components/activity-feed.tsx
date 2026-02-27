"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type {
  ActivityItem,
  ActivityItemType,
  CommitRaw,
  DeploymentRaw,
  TicketRaw,
} from "@/lib/activity-types";

import { CommitItem } from "@/components/activity-items/commit-item";
import { DeploymentItem } from "@/components/activity-items/deployment-item";
import { TicketItem } from "@/components/activity-items/ticket-item";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  buildCommitContextPrompt,
  buildDeploymentContextPrompt,
  buildTicketContextPrompt,
} from "@/lib/activity-context";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Normalizers: convert raw API data into unified ActivityItem[]
// ─────────────────────────────────────────────────────────────────────────────

function normalizeCommits(
  commits:
    | {
        hash: string;
        shortHash: string;
        subject: string;
        body: string;
        author: string;
        date: string;
      }[]
    | undefined
): ActivityItem[] {
  if (!commits) return [];
  return commits.map((c) => {
    const raw: CommitRaw = {
      hash: c.hash,
      shortHash: c.shortHash,
      subject: c.subject,
      body: c.body,
      author: c.author,
      date: c.date,
    };
    return {
      id: `commit:${c.hash}`,
      type: "commit" as ActivityItemType,
      timestamp: c.date,
      title: c.subject,
      subtitle: c.author,
      raw,
    };
  });
}

function normalizeDeployments(
  widgets:
    | {
        id: string;
        title: string;
        type: string;
        items: {
          id: string;
          title: string;
          subtitle?: string;
          status?: string;
          statusColor?: string;
          url?: string;
          secondaryUrl?: string;
          secondaryLabel?: string;
          timestamp?: string;
        }[];
      }[]
    | undefined
): ActivityItem[] {
  if (!widgets) return [];
  const deploysWidget = widgets.find((w) => w.id === "railway-deploys");
  if (!deploysWidget) return [];

  return deploysWidget.items.map((item) => {
    const raw: DeploymentRaw = {
      id: item.id,
      status: item.status ?? "UNKNOWN",
      statusColor: item.statusColor ?? "#6b7280",
      serviceName: item.title,
      createdAt: item.timestamp ?? new Date().toISOString(),
      commitMessage: item.subtitle,
      commitHash: item.secondaryLabel
        ? item.secondaryUrl?.split("/").at(-1)
        : undefined,
      dashboardUrl: item.url,
      githubUrl: item.secondaryUrl,
    };
    return {
      id: `deploy:${item.id}`,
      type: "deployment" as ActivityItemType,
      timestamp: item.timestamp ?? new Date().toISOString(),
      title: item.title,
      subtitle: item.subtitle,
      status: item.status,
      statusColor: item.statusColor,
      url: item.url,
      raw,
    };
  });
}

function normalizeTickets(
  widgets:
    | {
        id: string;
        title: string;
        type: string;
        items: {
          id: string;
          title: string;
          subtitle?: string;
          status?: string;
          statusColor?: string;
          url?: string;
          timestamp?: string;
        }[];
      }[]
    | undefined
): ActivityItem[] {
  if (!widgets) return [];

  const seen = new Set<string>();
  const items: ActivityItem[] = [];

  for (const widget of widgets) {
    if (widget.id !== "linear-assigned" && widget.id !== "linear-recent")
      continue;
    for (const item of widget.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);

      // item.title is "IDENTIFIER Title text", so we split off the identifier
      const spaceIdx = item.title.indexOf(" ");
      const identifier = spaceIdx > 0 ? item.title.slice(0, spaceIdx) : item.id;
      const title = spaceIdx > 0 ? item.title.slice(spaceIdx + 1) : item.title;

      const raw: TicketRaw = {
        identifier,
        title,
        status: item.status ?? "",
        statusColor: item.statusColor ?? "#6b7280",
        assignee: item.subtitle,
        url: item.url ?? "",
        updatedAt: item.timestamp,
      };
      items.push({
        id: `ticket:${item.id}`,
        type: "ticket" as ActivityItemType,
        timestamp: item.timestamp ?? new Date().toISOString(),
        title,
        subtitle: item.status,
        status: item.status,
        statusColor: item.statusColor,
        url: item.url,
        raw,
      });
    }
  }
  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter chip
// ─────────────────────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  count,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:border-border/80 hover:bg-muted hover:text-foreground"
      )}
    >
      {color && (
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "text-[10px]",
            active ? "text-muted-foreground" : "text-muted-foreground/60"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ hasIntegrations }: { hasIntegrations: boolean }) {
  if (!hasIntegrations) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 px-6 text-center">
        <div className="text-2xl">🔗</div>
        <p className="text-sm font-medium text-foreground">
          No integrations connected
        </p>
        <p className="text-xs text-muted-foreground max-w-[220px]">
          Connect Railway or Linear integrations to see deployments and tickets
          here alongside your git commits.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 px-6 text-center">
      <div className="text-2xl">✨</div>
      <p className="text-sm font-medium text-foreground">No activity yet</p>
      <p className="text-xs text-muted-foreground">
        Commits, deployments, and tickets will appear here as they happen.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────────────────────────────

function SectionDivider({ date }: { date: string }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/50 bg-background/95 px-3 py-1 backdrop-blur-sm">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {date}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Group items by date
// ─────────────────────────────────────────────────────────────────────────────

function groupByDate(
  items: ActivityItem[]
): { date: string; items: ActivityItem[] }[] {
  const groups = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const d = new Date(item.timestamp);
    const now = new Date();
    let label: string;
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) label = "Today";
    else if (diffDays === 1) label = "Yesterday";
    else if (diffDays < 7)
      label = d.toLocaleDateString(undefined, { weekday: "long" });
    else
      label = d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: diffDays > 365 ? "numeric" : undefined,
      });

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }
  return Array.from(groups.entries()).map(([date, items]) => ({ date, items }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ActivityFeed({ slug }: { slug: string }) {
  const router = useRouter();

  // Filter state
  const [activeTypes, setActiveTypes] = useState<Set<ActivityItemType>>(
    new Set(["commit", "deployment", "ticket"])
  );
  const [activeDeployStatuses, setActiveDeployStatuses] = useState<Set<string>>(
    new Set()
  );
  const [activeTicketStatuses, setActiveTicketStatuses] = useState<Set<string>>(
    new Set()
  );

  // ── Data fetching ────────────────────────────────────────────────────────

  // Git log
  const { data: gitLog, isLoading: gitLoading } = useQuery({
    ...orpc.projects.gitLog.queryOptions({ input: { slug, limit: 50 } }),
    refetchInterval: 30_000,
  });

  // Integrations list (no auth field)
  const { data: integrations } = useQuery({
    ...orpc.integrations.list.queryOptions(),
    staleTime: 60_000,
  });

  // Find Railway and Linear integrations for this project
  const railwayIntegration = integrations?.find(
    (i) => i.projectSlug === slug && i.type === "railway" && i.enabled
  );
  const linearIntegration = integrations?.find(
    (i) => i.projectSlug === slug && i.type === "linear" && i.enabled
  );

  // Railway widget data
  const { data: railwayData, isLoading: railwayLoading } = useQuery({
    ...orpc.integrations.data.queryOptions({
      input: { id: railwayIntegration?.id ?? "" },
    }),
    enabled: !!railwayIntegration,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  // Linear widget data
  const { data: linearData, isLoading: linearLoading } = useQuery({
    ...orpc.integrations.data.queryOptions({
      input: { id: linearIntegration?.id ?? "" },
    }),
    enabled: !!linearIntegration,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });

  const isLoading =
    gitLoading ||
    (!!railwayIntegration && railwayLoading) ||
    (!!linearIntegration && linearLoading);

  // ── Merge & normalize ────────────────────────────────────────────────────

  const allItems = useMemo<ActivityItem[]>(() => {
    const commits = normalizeCommits(gitLog?.commits);
    const deployments = normalizeDeployments(railwayData?.widgets);
    const tickets = normalizeTickets(linearData?.widgets);
    return [...commits, ...deployments, ...tickets].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [gitLog, railwayData, linearData]);

  // ── Correlation maps ──────────────────────────────────────────────────────
  // Computed once from allItems; no extra fetch needed.

  const {
    commitToDeployments,
    deploymentToCommit,
    commitToTickets,
    ticketToCommits,
  } = useMemo(() => {
    const commits = allItems
      .filter((i) => i.type === "commit")
      .map((i) => i.raw as CommitRaw);
    const deployments = allItems
      .filter((i) => i.type === "deployment")
      .map((i) => i.raw as DeploymentRaw);
    const tickets = allItems
      .filter((i) => i.type === "ticket")
      .map((i) => i.raw as TicketRaw);

    // ── Commit ↔ Deployment ─────────────────────────────────────────────────
    // Match by commit hash prefix (handles both full-SHA and 7-char short hashes
    // that Railway may return).

    const commitToDeployments = new Map<string, DeploymentRaw[]>();
    const deploymentToCommit = new Map<string, CommitRaw>();

    for (const deployment of deployments) {
      if (!deployment.commitHash) continue;
      const depHash = deployment.commitHash.toLowerCase();

      for (const commit of commits) {
        const fullHash = commit.hash.toLowerCase();
        const shortHash = commit.shortHash.toLowerCase();

        const matches =
          fullHash.startsWith(depHash) ||
          depHash.startsWith(fullHash) ||
          shortHash === depHash;

        if (matches) {
          const existing = commitToDeployments.get(commit.hash) ?? [];
          commitToDeployments.set(commit.hash, [...existing, deployment]);
          if (!deploymentToCommit.has(deployment.id)) {
            deploymentToCommit.set(deployment.id, commit);
          }
          break;
        }
      }
    }

    // ── Commit ↔ Ticket ─────────────────────────────────────────────────────
    // Scan commit subject + body for ticket identifier patterns (e.g. ENG-123).

    const TICKET_RE = /\b([A-Z]{2,10}-\d+)\b/g;

    const commitToTickets = new Map<string, TicketRaw[]>();
    const ticketToCommits = new Map<string, CommitRaw[]>();

    const ticketByIdentifier = new Map<string, TicketRaw>();
    for (const ticket of tickets) {
      ticketByIdentifier.set(ticket.identifier.toUpperCase(), ticket);
    }

    for (const commit of commits) {
      const searchText = `${commit.subject} ${commit.body ?? ""}`;
      const found = new Set<string>();
      TICKET_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = TICKET_RE.exec(searchText)) !== null) {
        found.add(match[1].toUpperCase());
      }

      for (const identifier of found) {
        const ticket = ticketByIdentifier.get(identifier);
        if (!ticket) continue;

        const existingTickets = commitToTickets.get(commit.hash) ?? [];
        commitToTickets.set(commit.hash, [...existingTickets, ticket]);

        const existingCommits = ticketToCommits.get(identifier) ?? [];
        ticketToCommits.set(identifier, [...existingCommits, commit]);
      }
    }

    return { commitToDeployments, deploymentToCommit, commitToTickets, ticketToCommits };
  }, [allItems]);

  // ── Available filter options ─────────────────────────────────────────────

  const availableTypes = useMemo(
    () => new Set(allItems.map((i) => i.type)),
    [allItems]
  );

  const deployStatuses = useMemo(() => {
    const s = new Set<string>();
    allItems
      .filter((i) => i.type === "deployment" && i.status)
      .forEach((i) => s.add(i.status!));
    return s;
  }, [allItems]);

  const ticketStatuses = useMemo(() => {
    const s = new Set<string>();
    allItems
      .filter((i) => i.type === "ticket" && i.status)
      .forEach((i) => s.add(i.status!));
    return s;
  }, [allItems]);

  // ── Filtering ────────────────────────────────────────────────────────────

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (!activeTypes.has(item.type)) return false;
      if (item.type === "deployment" && activeDeployStatuses.size > 0) {
        return item.status && activeDeployStatuses.has(item.status);
      }
      if (item.type === "ticket" && activeTicketStatuses.size > 0) {
        return item.status && activeTicketStatuses.has(item.status);
      }
      return true;
    });
  }, [allItems, activeTypes, activeDeployStatuses, activeTicketStatuses]);

  const groupedItems = useMemo(
    () => groupByDate(filteredItems),
    [filteredItems]
  );

  // ── Chat handler ─────────────────────────────────────────────────────────

  function handleStartChat(item: ActivityItem) {
    let prompt: string;
    switch (item.type) {
      case "commit":
        prompt = buildCommitContextPrompt(item.raw as CommitRaw);
        break;
      case "deployment":
        prompt = buildDeploymentContextPrompt(item.raw as DeploymentRaw);
        break;
      case "ticket":
        prompt = buildTicketContextPrompt(item.raw as TicketRaw);
        break;
    }
    router.push(`/project/${slug}/chat?prompt=${encodeURIComponent(prompt)}`);
  }

  // ── Toggle helpers ───────────────────────────────────────────────────────

  function toggleType(type: ActivityItemType) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size === 1) return next; // keep at least one
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  function toggleDeployStatus(status: string) {
    setActiveDeployStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function toggleTicketStatus(status: string) {
    setActiveTicketStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const hasIntegrations = !!railwayIntegration || !!linearIntegration;
  const typeCount = (type: ActivityItemType) =>
    allItems.filter((i) => i.type === type).length;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="flex flex-col gap-2 border-b px-3 py-2.5">
        {/* Type filters */}
        {availableTypes.size > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {availableTypes.has("commit") && (
              <FilterChip
                label="Commits"
                active={activeTypes.has("commit")}
                count={typeCount("commit")}
                color="#8b5cf6"
                onClick={() => toggleType("commit")}
              />
            )}
            {availableTypes.has("deployment") && (
              <FilterChip
                label="Deployments"
                active={activeTypes.has("deployment")}
                count={typeCount("deployment")}
                color="#22c55e"
                onClick={() => toggleType("deployment")}
              />
            )}
            {availableTypes.has("ticket") && (
              <FilterChip
                label="Tickets"
                active={activeTypes.has("ticket")}
                count={typeCount("ticket")}
                color="#3b82f6"
                onClick={() => toggleType("ticket")}
              />
            )}

            {/* Clear sub-filters */}
            {(activeDeployStatuses.size > 0 ||
              activeTicketStatuses.size > 0) && (
              <button
                type="button"
                onClick={() => {
                  setActiveDeployStatuses(new Set());
                  setActiveTicketStatuses(new Set());
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-1"
              >
                Clear filters ×
              </button>
            )}
          </div>
        )}

        {/* Deployment status sub-filters */}
        {activeTypes.has("deployment") && deployStatuses.size > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-muted-foreground mr-0.5">
              Status:
            </span>
            {Array.from(deployStatuses).map((s) => (
              <FilterChip
                key={s}
                label={s.charAt(0) + s.slice(1).toLowerCase()}
                active={activeDeployStatuses.has(s)}
                onClick={() => toggleDeployStatus(s)}
              />
            ))}
          </div>
        )}

        {/* Ticket status sub-filters */}
        {activeTypes.has("ticket") && ticketStatuses.size > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-muted-foreground mr-0.5">
              Status:
            </span>
            {Array.from(ticketStatuses).map((s) => (
              <FilterChip
                key={s}
                label={s}
                active={activeTicketStatuses.has(s)}
                onClick={() => toggleTicketStatus(s)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Feed */}
      <TooltipProvider delay={400}>
        <div className="flex-1 overflow-y-auto">
          {isLoading && allItems.length === 0 ? (
            <div className="flex flex-col gap-0">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 border-b border-border/50 px-3 py-2.5"
                >
                  <div className="mt-0.5 h-5 w-5 rounded-full bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-24 rounded bg-muted animate-pulse" />
                    <div className="h-2.5 w-48 rounded bg-muted animate-pulse" />
                    <div className="h-2 w-20 rounded bg-muted animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <EmptyState hasIntegrations={hasIntegrations} />
          ) : (
            groupedItems.map(({ date, items }) => (
              <div key={date}>
                <SectionDivider date={date} />
                {items.map((item) => {
                  switch (item.type) {
                    case "commit": {
                      const raw = item.raw as CommitRaw;
                      return (
                        <CommitItem
                          key={item.id}
                          raw={raw}
                          onStartChat={() => handleStartChat(item)}
                          relatedDeployments={commitToDeployments.get(raw.hash)}
                          relatedTickets={commitToTickets.get(raw.hash)}
                        />
                      );
                    }
                    case "deployment": {
                      const raw = item.raw as DeploymentRaw;
                      return (
                        <DeploymentItem
                          key={item.id}
                          raw={raw}
                          onStartChat={() => handleStartChat(item)}
                          relatedCommit={deploymentToCommit.get(raw.id)}
                        />
                      );
                    }
                    case "ticket": {
                      const raw = item.raw as TicketRaw;
                      return (
                        <TicketItem
                          key={item.id}
                          raw={raw}
                          onStartChat={() => handleStartChat(item)}
                          relatedCommits={ticketToCommits.get(
                            raw.identifier.toUpperCase()
                          )}
                        />
                      );
                    }
                  }
                })}
              </div>
            ))
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}
