"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { getTimeAgo } from "@/lib/utils";

// Renders the pre-formatted markdown setup instructions as styled HTML
function SetupGuide({ webhookId }: { webhookId: string }) {
  const { data, isLoading } = useQuery(
    orpc.webhooks.setupInstructions.queryOptions({ input: { webhookId } })
  );

  if (isLoading)
    return (
      <p className="text-xs text-muted-foreground">Loading setup guide…</p>
    );
  if (!data) return null;

  // Parse the markdown-ish instructions into segments for styled rendering
  const lines = data.instructions.split("\n");

  return (
    <div className="mt-3 space-y-1.5 rounded-md border bg-muted/40 p-3 text-xs">
      {/* Webhook URL — always shown prominently */}
      <div className="mb-2 flex items-center gap-2 rounded border bg-background px-2 py-1.5">
        <span className="shrink-0 font-medium text-muted-foreground">URL</span>
        <code className="min-w-0 flex-1 truncate font-mono text-[11px]">
          {data.webhookUrl}
        </code>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(data.webhookUrl)}
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Copy webhook URL"
        >
          Copy
        </button>
        <a
          href={data.dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Open ↗
        </a>
      </div>

      {/* Instruction lines */}
      <div className="space-y-0.5">
        {lines.map((line, i) => {
          if (line.startsWith("## "))
            return (
              <p key={i} className="font-semibold text-foreground">
                {line.slice(3)}
              </p>
            );
          if (/^\d+\./.test(line))
            return (
              <p key={i} className="pl-2 text-foreground">
                {line}
              </p>
            );
          if (line.startsWith(">"))
            return (
              <p
                key={i}
                className="border-l-2 border-muted-foreground/30 pl-2 italic text-muted-foreground"
              >
                {line.slice(1).trim()}
              </p>
            );
          if (line.startsWith("   `") && line.endsWith("`"))
            return (
              <pre
                key={i}
                className="ml-4 overflow-x-auto rounded bg-background px-2 py-0.5 font-mono text-[11px]"
              >
                {line.trim().replace(/^`|`$/g, "")}
              </pre>
            );
          if (line.trim() === "") return <div key={i} className="h-1" />;
          return (
            <p key={i} className="text-muted-foreground">
              {line}
            </p>
          );
        })}
      </div>
    </div>
  );
}

const PROVIDERS = [
  { label: "Linear", value: "linear" },
  { label: "GitHub", value: "github" },
  { label: "Railway", value: "railway" },
  { label: "Generic", value: "generic" },
] as const;

export default function WebhooksPage() {
  const queryClient = useQueryClient();
  const { data: webhooks, isLoading } = useQuery({
    ...orpc.webhooks.list.queryOptions(),
    refetchInterval: 30000,
  });
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const { data: events } = useQuery({
    ...orpc.webhooks.events.queryOptions({ input: {} }),
    refetchInterval: 30000,
  });

  const [name, setName] = useState("");
  const [provider, setProvider] = useState<
    "linear" | "github" | "generic" | "railway"
  >("generic");
  const [projectSlug, setProjectSlug] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [signingSecret, setSigningSecret] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  // Track which webhook rows have their setup guide expanded; auto-expand on creation
  const [expandedGuides, setExpandedGuides] = useState<Set<string>>(new Set());
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  const toggleGuide = (id: string) =>
    setExpandedGuides((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { data: projectSessions } = useQuery({
    ...orpc.sessions.list.queryOptions({ input: { slug: projectSlug } }),
    enabled: !!projectSlug,
  });

  const { data: catalog } = useQuery(
    orpc.webhooks.eventCatalog.queryOptions({ input: { provider } })
  );

  const eventsByCategory = useMemo(() => {
    if (!catalog?.events) return {};
    const groups: Record<
      string,
      { key: string; label: string; description?: string }[]
    > = {};
    for (const ev of catalog.events) {
      if (!groups[ev.category]) groups[ev.category] = [];
      groups[ev.category].push(ev);
    }
    return groups;
  }, [catalog?.events]);

  const toggleEvent = (key: string) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCategory = (category: string) => {
    const evts = eventsByCategory[category] ?? [];
    const allSelected = evts.every((e) => selectedEvents.has(e.key));
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      for (const e of evts) {
        if (allSelected) next.delete(e.key);
        else next.add(e.key);
      }
      return next;
    });
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: orpc.webhooks.list.queryOptions().queryKey,
    });
    void queryClient.invalidateQueries({
      queryKey: orpc.webhooks.events.queryOptions({ input: {} }).queryKey,
    });
  };

  const createWebhook = useMutation({
    mutationFn: () =>
      client.webhooks.create({
        name,
        provider,
        prompt,
        ...(selectedEvents.size > 0
          ? { subscribedEvents: [...selectedEvents] }
          : {}),
        ...(projectSlug ? { projectSlug } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(signingSecret ? { signingSecret } : {}),
      }),
    onSuccess: (created) => {
      invalidate();
      setName("");
      setProvider("generic");
      setProjectSlug("");
      setSessionId("");
      setSigningSecret("");
      setPrompt("");
      setSelectedEvents(new Set());
      // Auto-expand setup guide for the newly created webhook
      if (created?.id) {
        setJustCreatedId(created.id);
        setExpandedGuides((prev) => new Set([...prev, created.id]));
      }
    },
  });

  const deleteWebhook = useMutation({
    mutationFn: (id: string) => client.webhooks.delete({ id }),
    onSuccess: invalidate,
  });

  const toggleWebhook = useMutation({
    mutationFn: (id: string) => client.webhooks.toggle({ id }),
    onSuccess: invalidate,
  });

  const webhookUrl = (id: string) =>
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/${id}`
      : `/api/webhooks/${id}`;

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-semibold">Webhooks</h1>

      {/* Create form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>New Webhook</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input
                placeholder="Webhook name..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-48"
              />
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value as typeof provider);
                  setSelectedEvents(new Set());
                }}
                className="rounded border bg-background px-2 text-sm"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <select
                value={projectSlug}
                onChange={(e) => {
                  setProjectSlug(e.target.value);
                  setSessionId("");
                }}
                className="rounded border bg-background px-2 text-sm"
              >
                <option value="">Global (no project)</option>
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
                <option value="">New session each time</option>
                {projectSessions?.map((s) => (
                  <option key={s.id} value={s.id}>
                    Resume: {s.firstPrompt.slice(0, 50)}
                    {s.firstPrompt.length > 50 ? "..." : ""}
                  </option>
                ))}
              </select>
              <Input
                type="password"
                placeholder="Signing secret (optional)"
                value={signingSecret}
                onChange={(e) => setSigningSecret(e.target.value)}
                className="w-48"
              />
            </div>
            {/* Event selector */}
            {catalog && Object.keys(eventsByCategory).length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Events
                </span>
                {Object.entries(eventsByCategory).map(([category, evts]) => (
                  <div key={category}>
                    <button
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      {category}
                      <span className="ml-1 text-[10px] font-normal">
                        ({evts.filter((e) => selectedEvents.has(e.key)).length}/
                        {evts.length})
                      </span>
                    </button>
                    <div className="ml-2 mt-0.5 flex flex-wrap gap-1">
                      {evts.map((ev) => (
                        <button
                          type="button"
                          key={ev.key}
                          onClick={() => toggleEvent(ev.key)}
                          className={`rounded border px-1.5 py-0.5 text-xs transition-colors ${
                            selectedEvents.has(ev.key)
                              ? "border-foreground/30 bg-foreground/10 text-foreground"
                              : "border-transparent bg-muted text-muted-foreground hover:text-foreground"
                          }`}
                          title={ev.description}
                        >
                          {ev.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Prompt templates */}
            {catalog && catalog.promptTemplates.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {catalog.promptTemplates.map((t) => (
                  <button
                    type="button"
                    key={t.label}
                    onClick={() => setPrompt(t.prompt)}
                    className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            <textarea
              placeholder="Prompt to run when webhook fires..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[80px] rounded border bg-background px-3 py-2 text-sm"
            />
            <Button
              size="sm"
              className="w-fit"
              disabled={!name || !prompt || createWebhook.isPending}
              onClick={() => createWebhook.mutate()}
            >
              {createWebhook.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Webhook list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !webhooks || webhooks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No webhooks configured.</p>
      ) : (
        <div className="mb-6 flex flex-col gap-2">
          {webhooks.map((wh) => (
            <Card
              key={wh.id}
              size="sm"
              className={
                justCreatedId === wh.id ? "ring-1 ring-primary/40" : ""
              }
            >
              <CardContent className="py-3">
                {/* Row */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleWebhook.mutate(wh.id)}
                    className={`h-3 w-3 shrink-0 rounded-full border ${wh.enabled ? "bg-green-500 border-green-600" : "bg-muted border-muted-foreground/30"}`}
                    title={wh.enabled ? "Disable" : "Enable"}
                  />
                  <span className="shrink-0 text-sm font-medium">
                    {wh.name}
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {wh.provider}
                  </Badge>
                  {wh.integrationId && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      linked
                    </Badge>
                  )}
                  {wh.subscribedEvents && wh.subscribedEvents.length > 0 && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {wh.subscribedEvents.length} events
                    </Badge>
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {wh.prompt}
                  </span>
                  {wh.projectSlug && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {wh.projectSlug
                        .replace(/-/g, "/")
                        .split("/")
                        .slice(-2)
                        .join("/")}
                    </span>
                  )}
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {wh.triggerCount}x
                  </span>
                  {wh.lastStatus && (
                    <Badge
                      variant={
                        wh.lastStatus === "success"
                          ? "secondary"
                          : wh.lastStatus === "error"
                            ? "destructive"
                            : "outline"
                      }
                      className="text-[10px]"
                    >
                      {wh.lastStatus}
                    </Badge>
                  )}
                  {/* Setup guide toggle */}
                  <button
                    onClick={() => toggleGuide(wh.id)}
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] transition-colors ${expandedGuides.has(wh.id) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                    title="Toggle setup guide"
                  >
                    Setup {expandedGuides.has(wh.id) ? "▲" : "▼"}
                  </button>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(webhookUrl(wh.id));
                    }}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Copy webhook URL"
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
                      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>
                  </button>
                  <button
                    onClick={() => deleteWebhook.mutate(wh.id)}
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
                </div>
                {/* Setup guide panel */}
                {expandedGuides.has(wh.id) && <SetupGuide webhookId={wh.id} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Event log */}
      {events && events.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Recent Events
          </h2>
          <div className="flex flex-col gap-1.5">
            {events.slice(0, 50).map((ev) => (
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
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {ev.provider}
                </Badge>
                <span className="shrink-0 text-[10px] font-medium">
                  {ev.eventType}/{ev.action}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                  {ev.payloadSummary}
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
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
