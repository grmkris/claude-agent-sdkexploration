"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cronToHuman, CRON_PRESETS } from "@/lib/cron-human";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { getTimeAgo } from "@/lib/utils";

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function CronEventList({
  cronId,
  projectSlug,
}: {
  cronId: string;
  projectSlug: string;
}) {
  const { data: events, isLoading } = useQuery({
    ...orpc.crons.events.queryOptions({ input: { cronId } }),
    refetchInterval: 30000,
  });

  if (isLoading)
    return (
      <p className="px-3 py-2 text-[11px] text-muted-foreground">
        Loading events...
      </p>
    );
  if (!events || events.length === 0)
    return (
      <p className="px-3 py-2 text-[11px] text-muted-foreground">
        No executions yet.
      </p>
    );

  return (
    <div className="flex flex-col gap-1 px-3 pb-3 pt-1">
      {events.slice(0, 20).map((ev) => (
        <div
          key={ev.id}
          className="flex items-center gap-2 rounded border px-2 py-1"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${ev.status === "success" ? "bg-green-500" : ev.status === "error" ? "bg-red-500" : "bg-yellow-500 animate-pulse"}`}
          />
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {formatTimestamp(ev.timestamp)}
          </span>
          <Badge
            variant={
              ev.status === "success"
                ? "secondary"
                : ev.status === "error"
                  ? "destructive"
                  : "outline"
            }
            className="text-[10px]"
          >
            {ev.status}
          </Badge>
          {ev.sessionId ? (
            <Link
              href={`/project/${projectSlug}/chat/${ev.sessionId}`}
              className="shrink-0 text-[10px] font-mono text-blue-500 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {ev.sessionId.slice(0, 12)}...
            </Link>
          ) : (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              no session
            </span>
          )}
          {ev.error && (
            <span
              className="min-w-0 flex-1 truncate text-[10px] text-red-500"
              title={ev.error}
            >
              {ev.error}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function CronsPage() {
  const queryClient = useQueryClient();
  const { data: crons, isLoading } = useQuery({
    ...orpc.crons.list.queryOptions(),
    refetchInterval: 30000,
  });
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const { data: events } = useQuery({
    ...orpc.crons.events.queryOptions({ input: {} }),
    refetchInterval: 30000,
  });

  const [expandedCronId, setExpandedCronId] = useState<string | null>(null);
  const [preset, setPreset] = useState(CRON_PRESETS[0].value);
  const [customExpr, setCustomExpr] = useState("");
  const [prompt, setPrompt] = useState("");
  const [projectSlug, setProjectSlug] = useState("");
  const [sessionId, setSessionId] = useState("");

  const expression = preset || customExpr;
  const isCustom = preset === "";

  // Fetch sessions for selected project
  const { data: projectSessions } = useQuery({
    ...orpc.sessions.list.queryOptions({ input: { slug: projectSlug } }),
    enabled: !!projectSlug,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.crons.list.queryOptions().queryKey,
    });

  const createCron = useMutation({
    mutationFn: () =>
      client.crons.create({
        expression,
        prompt,
        projectSlug,
        projectPath: projects?.find((p) => p.slug === projectSlug)?.path,
        ...(sessionId ? { sessionId } : {}),
      }),
    onSuccess: () => {
      void invalidate();
      setPreset(CRON_PRESETS[0].value);
      setCustomExpr("");
      setPrompt("");
      setProjectSlug("");
      setSessionId("");
    },
  });

  const deleteCron = useMutation({
    mutationFn: (id: string) => client.crons.delete({ id }),
    onSuccess: invalidate,
  });

  const toggleCron = useMutation({
    mutationFn: (id: string) => client.crons.toggle({ id }),
    onSuccess: invalidate,
  });

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-semibold">Cron Jobs</h1>

      {/* Create form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>New Cron</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                className="rounded border bg-background px-2 text-sm"
              >
                {CRON_PRESETS.map((p) => (
                  <option key={p.label} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              {isCustom && (
                <Input
                  placeholder="*/30 * * * *"
                  value={customExpr}
                  onChange={(e) => setCustomExpr(e.target.value)}
                  className="w-40"
                />
              )}
              <select
                value={projectSlug}
                onChange={(e) => {
                  setProjectSlug(e.target.value);
                  setSessionId("");
                }}
                className="rounded border bg-background px-2 text-sm"
              >
                <option value="">Select project...</option>
                {projects?.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.path.split("/").slice(-2).join("/")}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <select
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="shrink-0 rounded border bg-background px-2 text-sm"
                disabled={!projectSlug}
              >
                <option value="">New session each run</option>
                {projectSessions?.map((s) => (
                  <option key={s.id} value={s.id}>
                    Resume: {s.firstPrompt.slice(0, 50)}
                    {s.firstPrompt.length > 50 ? "..." : ""}
                  </option>
                ))}
              </select>
            </div>
            <Input
              placeholder="Prompt to run..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <Button
              size="sm"
              className="w-fit"
              disabled={
                !expression || !prompt || !projectSlug || createCron.isPending
              }
              onClick={() => createCron.mutate()}
            >
              {createCron.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cron list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !crons || crons.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No cron jobs configured.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {crons.map((cron) => (
            <Card key={cron.id} size="sm">
              <CardContent
                className="flex cursor-pointer items-center gap-3 py-3"
                onClick={() =>
                  setExpandedCronId(expandedCronId === cron.id ? null : cron.id)
                }
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCron.mutate(cron.id);
                  }}
                  className={`h-3 w-3 shrink-0 rounded-full border ${cron.enabled ? "bg-green-500 border-green-600" : "bg-muted border-muted-foreground/30"}`}
                  title={cron.enabled ? "Disable" : "Enable"}
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${expandedCronId === cron.id ? "rotate-90" : ""}`}
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {cronToHuman(cron.expression)}
                </span>
                <Badge
                  variant="outline"
                  className="shrink-0 font-mono text-[10px]"
                >
                  {cron.expression}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {cron.prompt}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {cron.projectSlug
                    .replace(/-/g, "/")
                    .split("/")
                    .slice(-2)
                    .join("/")}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {cron.sessionId
                    ? `session: ${cron.sessionId.slice(0, 8)}...`
                    : "new session"}
                </span>
                {cron.lastRunStatus && (
                  <Badge
                    variant={
                      cron.lastRunStatus === "success"
                        ? "secondary"
                        : cron.lastRunStatus === "error"
                          ? "destructive"
                          : "outline"
                    }
                    className="text-[10px]"
                  >
                    {cron.lastRunStatus}
                  </Badge>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCron.mutate(cron.id);
                  }}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                  title="Delete"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </CardContent>
              {expandedCronId === cron.id && (
                <CronEventList
                  cronId={cron.id}
                  projectSlug={cron.projectSlug}
                />
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Event log */}
      {events && events.length > 0 && (
        <>
          <h2 className="mb-3 mt-6 text-sm font-medium text-muted-foreground">
            Recent Executions
          </h2>
          <div className="flex flex-col gap-1.5">
            {events.slice(0, 50).map((ev) => {
              const parentCron = crons?.find((c) => c.id === ev.cronId);
              return (
                <div
                  key={ev.id}
                  className="flex items-center gap-2 rounded border px-2 py-1.5"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${ev.status === "success" ? "bg-green-500" : ev.status === "error" ? "bg-red-500" : "bg-yellow-500 animate-pulse"}`}
                  />
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {getTimeAgo(ev.timestamp)}
                  </span>
                  <span className="shrink-0 text-[10px] font-medium">
                    {cronToHuman(ev.expression)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                    {ev.prompt}
                  </span>
                  {ev.sessionId && parentCron ? (
                    <Link
                      href={`/project/${parentCron.projectSlug}/chat/${ev.sessionId}`}
                      className="shrink-0 text-[10px] font-mono text-blue-500 hover:underline"
                    >
                      {ev.sessionId.slice(0, 12)}...
                    </Link>
                  ) : ev.sessionId ? (
                    <span className="shrink-0 text-[10px] font-mono text-muted-foreground">
                      {ev.sessionId.slice(0, 12)}...
                    </span>
                  ) : null}
                  {ev.error && (
                    <span
                      className="truncate text-[10px] text-red-500"
                      title={ev.error}
                    >
                      {ev.error}
                    </span>
                  )}
                  <Badge
                    variant={
                      ev.status === "success"
                        ? "secondary"
                        : ev.status === "error"
                          ? "destructive"
                          : "outline"
                    }
                    className="text-[10px]"
                  >
                    {ev.status}
                  </Badge>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
