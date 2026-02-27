"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";

import type { WebhookConfig } from "@/lib/types";

import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { getTimeAgo } from "@/lib/utils";

function webhookUrl(id: string) {
  return typeof window !== "undefined"
    ? `${window.location.origin}/api/webhooks/${id}`
    : `/api/webhooks/${id}`;
}

// --- Webhook row ---

function WebhookRow({
  webhook,
  onToggle,
  onDelete,
}: {
  webhook: WebhookConfig;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: setupData } = useQuery({
    ...orpc.webhooks.setupInstructions.queryOptions({
      input: { webhookId: webhook.id },
    }),
    enabled: expanded,
  });

  return (
    <div className="rounded border px-2 py-1">
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggle}
          className={`h-2 w-2 shrink-0 rounded-full border ${webhook.enabled ? "bg-green-500 border-green-600" : "bg-muted border-muted-foreground/30"}`}
          title={webhook.enabled ? "Disable" : "Enable"}
        />
        <button
          onClick={() => setExpanded(!expanded)}
          className="min-w-0 flex-1 truncate text-left text-[11px] font-medium hover:text-foreground"
        >
          {webhook.name}
        </button>
        {webhook.subscribedEvents && webhook.subscribedEvents.length > 0 && (
          <Badge variant="outline" className="shrink-0 text-[9px]">
            {webhook.subscribedEvents.length} events
          </Badge>
        )}
        {webhook.lastStatus && (
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              webhook.lastStatus === "success"
                ? "bg-green-500"
                : webhook.lastStatus === "error"
                  ? "bg-red-500"
                  : "bg-yellow-500 animate-pulse"
            }`}
          />
        )}
        <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
          {webhook.triggerCount}x
        </span>
        <CopyButton text={webhookUrl(webhook.id)} />
        <button
          onClick={onDelete}
          className="shrink-0 text-muted-foreground hover:text-destructive"
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
            className="h-3 w-3"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      {expanded && (
        <div className="mt-1.5 space-y-1.5">
          <div className="text-[10px] text-muted-foreground">
            {webhook.prompt.slice(0, 120)}
            {webhook.prompt.length > 120 ? "..." : ""}
          </div>
          {setupData && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  {setupData.webhookUrl}
                </code>
                <CopyButton text={setupData.webhookUrl} />
              </div>
              {setupData.dashboardUrl && (
                <a
                  href={setupData.dashboardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-blue-400 hover:underline"
                >
                  Open Dashboard →
                </a>
              )}
            </div>
          )}
          {webhook.lastTriggered && (
            <div className="text-[10px] text-muted-foreground">
              Last triggered: {getTimeAgo(webhook.lastTriggered)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Add webhook form ---

function AddWebhookForm({
  integrationId,
  provider,
  projectSlug,
  onDone,
}: {
  integrationId: string;
  provider: string;
  projectSlug?: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [signingSecret, setSigningSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{
    autoCreated: boolean;
    autoCreateError?: string;
    webhookId?: string;
  } | null>(null);

  const { data: catalog } = useQuery(
    orpc.webhooks.eventCatalog.queryOptions({ input: { provider } })
  );

  // Group events by category
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
    const events = eventsByCategory[category] ?? [];
    const allSelected = events.every((e) => selectedEvents.has(e.key));
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      for (const e of events) {
        if (allSelected) next.delete(e.key);
        else next.add(e.key);
      }
      return next;
    });
  };

  const creating = useMutation({
    mutationFn: async () => {
      const res = await client.webhooks.createForIntegration({
        name: name || `${provider} webhook`,
        integrationId,
        subscribedEvents: [...selectedEvents],
        prompt,
        ...(signingSecret ? { signingSecret } : {}),
        ...(projectSlug ? { projectSlug } : {}),
      });
      return res;
    },
    onSuccess: (data) => {
      setResult({
        autoCreated: data.autoCreated,
        autoCreateError: data.autoCreateError,
        webhookId: data.webhook.id,
      });
      void queryClient.invalidateQueries({
        queryKey: orpc.webhooks.list.queryOptions().queryKey,
      });
    },
  });

  // After successful creation
  if (result) {
    return (
      <div className="space-y-2 rounded border border-dashed p-2">
        {result.autoCreated ? (
          <div className="text-[10px] text-green-400">
            Webhook registered in {provider}
          </div>
        ) : result.autoCreateError ? (
          <div className="text-[10px] text-yellow-400">
            Auto-registration failed: {result.autoCreateError}. Set up manually:
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground">
            Set up webhook manually:
          </div>
        )}
        {result.webhookId && <SetupInstructions webhookId={result.webhookId} />}
        <Button
          size="sm"
          variant="ghost"
          onClick={onDone}
          className="text-[10px]"
        >
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded border border-dashed p-2">
      <Input
        placeholder="Webhook name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="text-xs"
      />

      {/* Event selector */}
      {catalog && Object.keys(eventsByCategory).length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium text-muted-foreground">
            Events
          </span>
          {Object.entries(eventsByCategory).map(([category, events]) => (
            <div key={category}>
              <button
                onClick={() => toggleCategory(category)}
                className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
              >
                {category}
                <span className="ml-1 text-[9px] font-normal">
                  ({events.filter((e) => selectedEvents.has(e.key)).length}/
                  {events.length})
                </span>
              </button>
              <div className="ml-2 mt-0.5 flex flex-wrap gap-1">
                {events.map((ev) => (
                  <button
                    key={ev.key}
                    onClick={() => toggleEvent(ev.key)}
                    className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
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

      {/* Prompt template picker + textarea */}
      <div className="space-y-1">
        {catalog && catalog.promptTemplates.length > 0 && (
          <div className="flex gap-1">
            {catalog.promptTemplates.map((t) => (
              <button
                key={t.label}
                onClick={() => setPrompt(t.prompt)}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
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
          className="min-h-[60px] w-full rounded border bg-background px-2 py-1.5 text-[11px]"
        />
      </div>

      {/* Signing secret — hidden for Railway */}
      {catalog?.verification === "hmac-sha256" && (
        <Input
          type="password"
          placeholder="Signing secret (auto-generated if empty)"
          value={signingSecret}
          onChange={(e) => setSigningSecret(e.target.value)}
          className="text-xs"
        />
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!prompt || selectedEvents.size === 0 || creating.isPending}
          onClick={() => creating.mutate()}
        >
          {creating.isPending ? "Creating..." : "Create"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// --- Setup instructions display ---

function SetupInstructions({ webhookId }: { webhookId: string }) {
  const { data } = useQuery(
    orpc.webhooks.setupInstructions.queryOptions({
      input: { webhookId },
    })
  );

  if (!data) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-muted px-1.5 py-0.5 text-[10px]">
          {data.webhookUrl}
        </code>
        <CopyButton text={data.webhookUrl} />
      </div>
      {data.dashboardUrl && (
        <a
          href={data.dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-[10px] text-blue-400 hover:underline"
        >
          Open Dashboard →
        </a>
      )}
    </div>
  );
}

// --- Main component ---

export function IntegrationWebhooks({
  integrationId,
  provider,
  projectSlug,
}: {
  integrationId: string;
  provider: string;
  projectSlug?: string;
}) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: allWebhooks } = useQuery({
    ...orpc.webhooks.list.queryOptions(),
    refetchInterval: 30_000,
  });

  const webhooks = useMemo(
    () => allWebhooks?.filter((w) => w.integrationId === integrationId) ?? [],
    [allWebhooks, integrationId]
  );

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.webhooks.list.queryOptions().queryKey,
    });

  const deleteWebhook = useMutation({
    mutationFn: (id: string) => client.webhooks.delete({ id }),
    onSuccess: invalidate,
  });

  const toggleWebhook = useMutation({
    mutationFn: (id: string) => client.webhooks.toggle({ id }),
    onSuccess: invalidate,
  });

  return (
    <div className="mt-2 border-t pt-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[10px] font-medium text-muted-foreground">
          Webhooks
          {webhooks.length > 0 && (
            <span className="ml-1 font-normal">({webhooks.length})</span>
          )}
        </span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          {showForm ? "cancel" : "+ add"}
        </button>
      </div>

      {showForm && (
        <AddWebhookForm
          integrationId={integrationId}
          provider={provider}
          projectSlug={projectSlug}
          onDone={() => {
            setShowForm(false);
            void invalidate();
          }}
        />
      )}

      {webhooks.length > 0 && (
        <div className="flex flex-col gap-1">
          {webhooks.map((wh) => (
            <WebhookRow
              key={wh.id}
              webhook={wh}
              onToggle={() => toggleWebhook.mutate(wh.id)}
              onDelete={() => deleteWebhook.mutate(wh.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
