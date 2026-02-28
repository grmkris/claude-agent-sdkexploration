"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type {
  ActivityItem,
  ActivityItemType,
  CommitRaw,
  CronEventRaw,
  DeploymentRaw,
  EmailEventRaw,
  TicketRaw,
  WebhookEventRaw,
} from "@/lib/activity-types";

import { ActivityDetailSheet } from "@/components/activity-detail-sheet";
import { CommitItem } from "@/components/activity-items/commit-item";
import { CronEventItem } from "@/components/activity-items/cron-event-item";
import { EmailEventItem } from "@/components/activity-items/email-event-item";
import { TicketItem } from "@/components/activity-items/ticket-item";
import { WebhookEventItem } from "@/components/activity-items/webhook-event-item";
import { ChatContextSheet } from "@/components/chat-context-sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCommitExpand } from "@/hooks/use-commit-expand";
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
          logsUrl?: string;
          timestamp?: string;
        }[];
      }[]
    | undefined
): ActivityItem[] {
  if (!widgets) return [];
  const deploysWidget = widgets.find((w) => w.id === "railway-deploys");
  if (!deploysWidget) return [];

  // Build service-name → live URL map from the railway-services widget
  const servicesWidget = widgets.find((w) => w.id === "railway-services");
  const serviceUrlByName = new Map<string, string>();
  for (const svc of servicesWidget?.items ?? []) {
    if (svc.secondaryUrl) serviceUrlByName.set(svc.title, svc.secondaryUrl);
  }

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
      serviceUrl: serviceUrlByName.get(item.title),
      logsUrl: item.logsUrl,
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

function normalizeEmailEvents(
  events:
    | {
        id: string;
        projectSlug: string;
        timestamp: string;
        direction: "inbound" | "outbound";
        from: string;
        to: string;
        subject?: string;
        status: "success" | "error" | "running";
        sessionId?: string;
      }[]
    | undefined,
  slug: string
): ActivityItem[] {
  if (!events) return [];
  // Only include events for this project (or root outbound)
  return events
    .filter(
      (e) =>
        e.projectSlug === slug ||
        e.projectSlug === "__root__" ||
        e.projectSlug === "__outbound__"
    )
    .map((e) => {
      const raw: EmailEventRaw = {
        id: e.id,
        direction: e.direction,
        from: e.from,
        to: e.to,
        subject: e.subject,
        status: e.status,
        sessionId: e.sessionId,
        timestamp: e.timestamp,
        projectSlug: e.projectSlug,
      };
      return {
        id: `email:${e.id}`,
        type: "email" as ActivityItemType,
        timestamp: e.timestamp,
        title:
          e.subject ??
          `${e.direction === "inbound" ? "Email from" : "Email to"} ${e.direction === "inbound" ? e.from : e.to}`,
        subtitle: e.from,
        status: e.status,
        raw,
      };
    });
}

function normalizeWebhookEvents(
  events:
    | {
        id: string;
        webhookId: string;
        timestamp: string;
        provider: string;
        eventType: string;
        action: string;
        payloadSummary: string;
        status: "success" | "error" | "running";
        sessionId?: string;
      }[]
    | undefined,
  projectWebhookIds: Set<string>
): ActivityItem[] {
  if (!events) return [];
  return events
    .filter((e) => projectWebhookIds.has(e.webhookId))
    .map((e) => {
      const raw: WebhookEventRaw = {
        id: e.id,
        webhookId: e.webhookId,
        provider: e.provider,
        eventType: e.eventType,
        action: e.action,
        payloadSummary: e.payloadSummary,
        status: e.status,
        sessionId: e.sessionId,
        timestamp: e.timestamp,
      };
      return {
        id: `webhook:${e.id}`,
        type: "webhook" as ActivityItemType,
        timestamp: e.timestamp,
        title: `${e.eventType}${e.action ? ` · ${e.action}` : ""}`,
        subtitle: e.provider,
        status: e.status,
        raw,
      };
    });
}

function normalizeCronEvents(
  events:
    | {
        id: string;
        cronId: string;
        timestamp: string;
        status: "success" | "error" | "running";
        expression: string;
        prompt: string;
        sessionId?: string;
        error?: string;
      }[]
    | undefined,
  projectCronIds: Set<string>
): ActivityItem[] {
  if (!events) return [];
  return events
    .filter((e) => projectCronIds.has(e.cronId))
    .map((e) => {
      const raw: CronEventRaw = {
        id: e.id,
        cronId: e.cronId,
        expression: e.expression,
        prompt: e.prompt,
        status: e.status,
        sessionId: e.sessionId,
        error: e.error,
        timestamp: e.timestamp,
      };
      return {
        id: `cron:${e.id}`,
        type: "cron" as ActivityItemType,
        timestamp: e.timestamp,
        title: e.expression,
        subtitle: e.prompt,
        status: e.status,
        raw,
      };
    });
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
        Commits, deployments, tickets, emails, webhooks, and cron runs will
        appear here as they happen.
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

export function ActivityFeed({
  slug,
  mode = "expand",
  initialCommitHash,
}: {
  slug: string;
  mode?: "expand" | "navigate";
  initialCommitHash?: string | null;
}) {
  const router = useRouter();

  // Filter state — deployments excluded (they surface inline on commit badges)
  const [activeTypes, setActiveTypes] = useState<Set<ActivityItemType>>(
    new Set(["commit", "ticket", "email", "webhook", "cron"])
  );
  const [activeTicketStatuses, setActiveTicketStatuses] = useState<Set<string>>(
    new Set()
  );

  // Detail sheet state
  const [detailItem, setDetailItem] = useState<ActivityItem | null>(null);

  // Chat context sheet state
  const [chatContextItem, setChatContextItem] = useState<ActivityItem | null>(
    null
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

  // GitHub integration → commit link base URL
  const githubIntegration = useMemo(
    () =>
      integrations?.find(
        (i) => i.projectSlug === slug && i.type === "github" && i.enabled
      ),
    [integrations, slug]
  );

  const githubRepoUrl = useMemo(() => {
    const url = githubIntegration?.config?.gitRemoteUrl as string | undefined;
    if (!url) return null;
    const match = url.match(/github\.com[:/]([^/]+\/[^/.]+)/);
    return match ? `https://github.com/${match[1]}` : null;
  }, [githubIntegration]);

  // Commit expand/collapse state + lazy-fetch for files & diffs
  const commitExpand = useCommitExpand({
    slug,
    initialCommitHash: mode === "expand" ? initialCommitHash : undefined,
  });

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

  // Email events for this project
  const { data: emailEventsData } = useQuery({
    ...orpc.email.events.queryOptions({ input: { projectSlug: slug } }),
    refetchInterval: 30_000,
  });

  // Webhook configs — used to know which webhooks belong to this project
  const { data: webhookConfigs } = useQuery({
    ...orpc.webhooks.list.queryOptions(),
    staleTime: 60_000,
  });

  const projectWebhookIds = useMemo(
    () =>
      new Set(
        (webhookConfigs ?? [])
          .filter((w) => w.projectSlug === slug)
          .map((w) => w.id)
      ),
    [webhookConfigs, slug]
  );

  // All webhook events — filtered client-side to this project's webhooks
  const { data: webhookEventsData } = useQuery({
    ...orpc.webhooks.events.queryOptions({ input: {} }),
    refetchInterval: 30_000,
    enabled: projectWebhookIds.size > 0,
  });

  // Cron configs — used to know which crons belong to this project
  const { data: cronConfigs } = useQuery({
    ...orpc.crons.list.queryOptions(),
    staleTime: 60_000,
  });

  const projectCronIds = useMemo(
    () =>
      new Set(
        (cronConfigs ?? [])
          .filter((c) => c.projectSlug === slug)
          .map((c) => c.id)
      ),
    [cronConfigs, slug]
  );

  // All cron events — filtered client-side to this project's crons
  const { data: cronEventsData } = useQuery({
    ...orpc.crons.events.queryOptions({ input: {} }),
    refetchInterval: 30_000,
    enabled: projectCronIds.size > 0,
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
    const emails = normalizeEmailEvents(emailEventsData, slug);
    const webhooks = normalizeWebhookEvents(
      webhookEventsData,
      projectWebhookIds
    );
    const crons = normalizeCronEvents(cronEventsData, projectCronIds);
    return [
      ...commits,
      ...deployments,
      ...tickets,
      ...emails,
      ...webhooks,
      ...crons,
    ].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [
    gitLog,
    railwayData,
    linearData,
    emailEventsData,
    webhookEventsData,
    projectWebhookIds,
    cronEventsData,
    projectCronIds,
    slug,
  ]);

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

    return {
      commitToDeployments,
      deploymentToCommit,
      commitToTickets,
      ticketToCommits,
    };
  }, [allItems]);

  // ── Available filter options ─────────────────────────────────────────────

  const availableTypes = useMemo(
    () => new Set(allItems.map((i) => i.type)),
    [allItems]
  );

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
      if (item.type === "ticket" && activeTicketStatuses.size > 0) {
        return item.status && activeTicketStatuses.has(item.status);
      }
      return true;
    });
  }, [allItems, activeTypes, activeTicketStatuses]);

  // Deployments are always suppressed as standalone rows — they surface inline
  // on commit rows as clickable badges. No separate absorbed-ids logic needed.

  const groupedItems = useMemo(
    () => groupByDate(filteredItems.filter((i) => i.type !== "deployment")),
    [filteredItems]
  );

  // ── Chat handler ─────────────────────────────────────────────────────────
  // For items that already have an associated session (email/webhook/cron that
  // ran an agent), navigate directly to that session. Otherwise open the
  // context-selector sheet so the user can pick what to include.

  function handleStartChat(item: ActivityItem) {
    switch (item.type) {
      case "email": {
        const raw = item.raw as EmailEventRaw;
        if (raw.sessionId) {
          const isRoot =
            raw.projectSlug === "__root__" ||
            raw.projectSlug === "__outbound__";
          router.push(
            isRoot
              ? `/chat/${raw.sessionId}`
              : `/project/${slug}/chat/${raw.sessionId}`
          );
          return;
        }
        break;
      }
      case "webhook": {
        const raw = item.raw as WebhookEventRaw;
        if (raw.sessionId) {
          router.push(`/project/${slug}/chat/${raw.sessionId}`);
          return;
        }
        break;
      }
      case "cron": {
        const raw = item.raw as CronEventRaw;
        if (raw.sessionId) {
          router.push(`/project/${slug}/chat/${raw.sessionId}`);
          return;
        }
        break;
      }
    }
    // Open the context-selector sheet
    setChatContextItem(item);
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
      {/* Filter bar — only render when there are multiple types to filter */}
      {(availableTypes.size > 2 ||
        (activeTypes.has("ticket") && ticketStatuses.size > 1)) && (
        <div className="flex flex-col gap-2 border-b px-3 py-2.5">
          {/* Type filters — deployments omitted; they show inline on commit badges */}
          {availableTypes.size > 2 && (
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
              {availableTypes.has("ticket") && (
                <FilterChip
                  label="Tickets"
                  active={activeTypes.has("ticket")}
                  count={typeCount("ticket")}
                  color="#3b82f6"
                  onClick={() => toggleType("ticket")}
                />
              )}
              {availableTypes.has("email") && (
                <FilterChip
                  label="Emails"
                  active={activeTypes.has("email")}
                  count={typeCount("email")}
                  color="#6366f1"
                  onClick={() => toggleType("email")}
                />
              )}
              {availableTypes.has("webhook") && (
                <FilterChip
                  label="Webhooks"
                  active={activeTypes.has("webhook")}
                  count={typeCount("webhook")}
                  color="#f97316"
                  onClick={() => toggleType("webhook")}
                />
              )}
              {availableTypes.has("cron") && (
                <FilterChip
                  label="Crons"
                  active={activeTypes.has("cron")}
                  count={typeCount("cron")}
                  color="#14b8a6"
                  onClick={() => toggleType("cron")}
                />
              )}

              {/* Clear sub-filters */}
              {activeTicketStatuses.size > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTicketStatuses(new Set())}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-1"
                >
                  Clear filters ×
                </button>
              )}
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
      )}

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
                      const isExpanded =
                        mode === "navigate"
                          ? false
                          : commitExpand.expandedCommit === raw.hash;
                      return (
                        <CommitItem
                          key={item.id}
                          raw={raw}
                          slug={slug}
                          compact={mode === "navigate"}
                          onStartChat={() => handleStartChat(item)}
                          relatedDeployments={commitToDeployments.get(raw.hash)}
                          relatedTickets={commitToTickets.get(raw.hash)}
                          isExpanded={isExpanded}
                          onToggleExpand={() => {
                            if (mode === "navigate") {
                              router.push(
                                `/project/${slug}/overview?commit=${raw.hash}`
                              );
                            } else {
                              commitExpand.toggleCommit(raw.hash);
                            }
                          }}
                          commitFiles={
                            isExpanded
                              ? commitExpand.commitFiles[raw.hash]
                              : undefined
                          }
                          loadingFiles={
                            commitExpand.loadingCommitFiles === raw.hash
                          }
                          expandedFileKey={commitExpand.expandedCommitFile}
                          onToggleFile={(path) =>
                            commitExpand.toggleCommitFile(raw.hash, path)
                          }
                          commitFileDiffs={commitExpand.commitFileDiffs}
                          loadingFileDiff={commitExpand.loadingCommitFileDiff}
                          githubRepoUrl={githubRepoUrl}
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
                    case "email": {
                      const raw = item.raw as EmailEventRaw;
                      return (
                        <EmailEventItem
                          key={item.id}
                          raw={raw}
                          onOpen={() => setDetailItem(item)}
                          onStartChat={() => handleStartChat(item)}
                        />
                      );
                    }
                    case "webhook": {
                      const raw = item.raw as WebhookEventRaw;
                      return (
                        <WebhookEventItem
                          key={item.id}
                          raw={raw}
                          onOpen={() => setDetailItem(item)}
                          onStartChat={() => handleStartChat(item)}
                        />
                      );
                    }
                    case "cron": {
                      const raw = item.raw as CronEventRaw;
                      return (
                        <CronEventItem
                          key={item.id}
                          raw={raw}
                          slug={slug}
                          onOpen={() => setDetailItem(item)}
                          onStartChat={() => handleStartChat(item)}
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

      {/* Detail sheet — opens for email / webhook / cron rows */}
      <ActivityDetailSheet
        item={detailItem}
        slug={slug}
        onClose={() => setDetailItem(null)}
      />

      {/* Chat context sheet — lets the user pick what context to include */}
      <ChatContextSheet
        item={chatContextItem}
        slug={slug}
        relatedDeployments={
          chatContextItem?.type === "commit"
            ? commitToDeployments.get((chatContextItem.raw as CommitRaw).hash)
            : undefined
        }
        relatedCommit={
          chatContextItem?.type === "deployment"
            ? deploymentToCommit.get((chatContextItem.raw as DeploymentRaw).id)
            : undefined
        }
        onClose={() => setChatContextItem(null)}
      />
    </div>
  );
}
