"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, useMemo } from "react";

import { ActivityHeatmap } from "@/components/activity-heatmap";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc";

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// --- Global stats header ---

function GlobalStatsHeader() {
  const { data: stats, isLoading } = useQuery(
    orpc.analytics.globalStats.queryOptions()
  );

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    { label: "Sessions Started", value: stats.numStartups.toLocaleString() },
    {
      label: "Prompts Sent",
      value: stats.promptQueueUseCount.toLocaleString(),
    },
    { label: "Total Cost", value: `$${stats.totalCost.toFixed(2)}` },
    { label: "Member Since", value: formatDate(stats.firstStartTime) },
    { label: "Tokens In", value: formatTokens(stats.totalInputTokens) },
    { label: "Tokens Out", value: formatTokens(stats.totalOutputTokens) },
    {
      label: "Lines Added",
      value: `+${stats.totalLinesAdded.toLocaleString()}`,
    },
    {
      label: "Lines Removed",
      value: `-${stats.totalLinesRemoved.toLocaleString()}`,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {statCards.map((s) => (
        <Card key={s.label} size="sm">
          <CardHeader>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
            <CardTitle className="text-lg tabular-nums">{s.value}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

// --- Activity heatmap section ---

function ActivitySection() {
  const { data: activity, isLoading } = useQuery(
    orpc.analytics.activity.queryOptions()
  );

  if (isLoading) return <Skeleton className="h-32" />;

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        Activity
      </h2>
      <ActivityHeatmap data={activity ?? []} />
    </section>
  );
}

// --- Per-project cost table ---

type SortKey = "name" | "cost" | "duration" | "lines" | "tokens";

function ProjectCostTable() {
  const { data: projects, isLoading } = useQuery(
    orpc.projects.list.queryOptions()
  );
  const [sortBy, setSortBy] = useState<SortKey>("cost");
  const [sortDesc, setSortDesc] = useState(true);

  const sorted = useMemo(() => {
    if (!projects) return [];
    const copy = [...projects];
    copy.sort((a, b) => {
      let av = 0,
        bv = 0;
      switch (sortBy) {
        case "name":
          return sortDesc
            ? b.path.localeCompare(a.path)
            : a.path.localeCompare(b.path);
        case "cost":
          av = a.lastCost ?? 0;
          bv = b.lastCost ?? 0;
          break;
        case "duration":
          av = a.lastDuration ?? 0;
          bv = b.lastDuration ?? 0;
          break;
        case "lines":
          av = (a.lastLinesAdded ?? 0) + (a.lastLinesRemoved ?? 0);
          bv = (b.lastLinesAdded ?? 0) + (b.lastLinesRemoved ?? 0);
          break;
        case "tokens":
          av = (a.lastTotalInputTokens ?? 0) + (a.lastTotalOutputTokens ?? 0);
          bv = (b.lastTotalInputTokens ?? 0) + (b.lastTotalOutputTokens ?? 0);
          break;
      }
      return sortDesc ? bv - av : av - bv;
    });
    return copy;
  }, [projects, sortBy, sortDesc]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDesc(!sortDesc);
    else {
      setSortBy(key);
      setSortDesc(true);
    }
  };

  const sortIndicator = (key: SortKey) =>
    sortBy === key ? (sortDesc ? " \u25BE" : " \u25B4") : "";

  if (isLoading) return <Skeleton className="h-48" />;

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        Projects
      </h2>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-[10px] text-muted-foreground">
              <th
                className="cursor-pointer px-2 py-1.5 font-medium"
                onClick={() => toggleSort("name")}
              >
                Project{sortIndicator("name")}
              </th>
              <th
                className="cursor-pointer px-2 py-1.5 text-right font-medium"
                onClick={() => toggleSort("cost")}
              >
                Cost{sortIndicator("cost")}
              </th>
              <th
                className="cursor-pointer px-2 py-1.5 text-right font-medium"
                onClick={() => toggleSort("duration")}
              >
                Duration{sortIndicator("duration")}
              </th>
              <th
                className="cursor-pointer px-2 py-1.5 text-right font-medium"
                onClick={() => toggleSort("lines")}
              >
                Lines{sortIndicator("lines")}
              </th>
              <th
                className="cursor-pointer px-2 py-1.5 text-right font-medium"
                onClick={() => toggleSort("tokens")}
              >
                Tokens{sortIndicator("tokens")}
              </th>
              <th className="px-2 py-1.5 text-right font-medium">Model</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const shortPath = p.path.split("/").slice(-2).join("/");
              const primaryModel = p.lastModelUsage
                ? Object.entries(p.lastModelUsage).sort(
                    (a, b) => b[1].costUSD - a[1].costUSD
                  )[0]?.[0]
                : undefined;
              return (
                <tr
                  key={p.slug}
                  className="border-b last:border-0 hover:bg-accent/30"
                >
                  <td className="px-2 py-1.5">
                    <Link
                      href={`/project/${p.slug}`}
                      className="hover:underline"
                    >
                      {shortPath}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {p.lastCost != null ? `$${p.lastCost.toFixed(2)}` : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {p.lastDuration != null
                      ? formatDuration(p.lastDuration)
                      : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {p.lastLinesAdded != null ? (
                      <span>
                        <span className="text-green-400">
                          +{p.lastLinesAdded}
                        </span>{" "}
                        <span className="text-red-400">
                          -{p.lastLinesRemoved ?? 0}
                        </span>
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {p.lastTotalInputTokens != null
                      ? `${formatTokens(p.lastTotalInputTokens)} / ${formatTokens(p.lastTotalOutputTokens ?? 0)}`
                      : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">
                    {primaryModel
                      ? primaryModel
                          .replace("claude-", "")
                          .split("-")
                          .slice(0, 2)
                          .join("-")
                      : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// --- Model usage breakdown ---

function ModelBreakdown() {
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());

  const models = useMemo(() => {
    if (!projects) return [];
    const totals = new Map<
      string,
      { inputTokens: number; outputTokens: number; costUSD: number }
    >();
    for (const p of projects) {
      if (!p.lastModelUsage) continue;
      for (const [model, usage] of Object.entries(p.lastModelUsage)) {
        const existing = totals.get(model) ?? {
          inputTokens: 0,
          outputTokens: 0,
          costUSD: 0,
        };
        existing.inputTokens += usage.inputTokens;
        existing.outputTokens += usage.outputTokens;
        existing.costUSD += usage.costUSD;
        totals.set(model, existing);
      }
    }
    return Array.from(totals.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.costUSD - a.costUSD);
  }, [projects]);

  if (models.length === 0) return null;

  const maxCost = models[0]?.costUSD ?? 1;

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        Model Usage
      </h2>
      <div className="flex flex-col gap-2">
        {models.map((m) => (
          <div key={m.name} className="flex items-center gap-3">
            <span className="w-40 shrink-0 truncate text-xs">
              {m.name.replace("claude-", "")}
            </span>
            <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted/30">
              <div
                className="absolute inset-y-0 left-0 rounded bg-emerald-600/50"
                style={{ width: `${(m.costUSD / maxCost) * 100}%` }}
              />
              <span className="relative z-10 flex h-full items-center px-2 text-[10px] tabular-nums">
                ${m.costUSD.toFixed(2)}
              </span>
            </div>
            <span className="w-24 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
              {formatTokens(m.inputTokens + m.outputTokens)} tok
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// --- Skill usage leaderboard ---

function SkillLeaderboard() {
  const { data: stats } = useQuery(orpc.analytics.globalStats.queryOptions());

  if (!stats?.skillUsage.length) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        Skill Usage
      </h2>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-[10px] text-muted-foreground">
              <th className="px-2 py-1.5 font-medium">Skill</th>
              <th className="px-2 py-1.5 text-right font-medium">Uses</th>
              <th className="px-2 py-1.5 text-right font-medium">Last Used</th>
            </tr>
          </thead>
          <tbody>
            {stats.skillUsage.map((s) => (
              <tr
                key={s.name}
                className="border-b last:border-0 hover:bg-accent/30"
              >
                <td className="px-2 py-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    /{s.name}
                  </Badge>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {s.usageCount}
                </td>
                <td className="px-2 py-1.5 text-right text-muted-foreground">
                  {new Date(s.lastUsedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// --- Page ---

export default function AnalyticsPage() {
  return (
    <div className="flex-1 overflow-auto p-4">
      <h1 className="mb-4 text-sm font-medium">Analytics</h1>
      <div className="flex flex-col gap-6">
        <GlobalStatsHeader />
        <ActivitySection />
        <ModelBreakdown />
        <ProjectCostTable />
        <SkillLeaderboard />
      </div>
    </div>
  );
}
