"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { getTimeAgo } from "@/lib/utils";

const PROMPT_SUGGESTIONS = [
  {
    label: "Triage & reply",
    prompt:
      "Analyze the incoming email. Categorize it by urgency and topic. Draft a helpful reply addressing the sender's questions or requests.",
  },
  {
    label: "Summarize",
    prompt:
      "Summarize the incoming email concisely. Extract key points, action items, and any deadlines mentioned.",
  },
  {
    label: "Forward to session",
    prompt:
      "Pass the full email content into the session context for continued conversation. Include sender, subject, and body.",
  },
] as const;

interface EmailContentProps {
  projectSlug?: string;
}

export function EmailContent({ projectSlug: scopedSlug }: EmailContentProps) {
  const queryClient = useQueryClient();
  const { data: configs, isLoading } = useQuery({
    ...orpc.email.listConfigs.queryOptions(),
    refetchInterval: 30000,
  });
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const { data: events } = useQuery({
    ...orpc.email.events.queryOptions({ input: {} }),
    refetchInterval: 30000,
  });
  const { data: domainInfo } = useQuery(orpc.email.domain.queryOptions());

  const domain = domainInfo?.domain ?? "your-domain.com";
  const existingAddresses = domainInfo?.addresses ?? [];
  const isDomainConfigured = domain !== "your-domain.com";

  const [addressMode, setAddressMode] = useState<"new" | "existing">("new");
  const [localPart, setLocalPart] = useState("");
  const [selectedAddress, setSelectedAddress] = useState("");
  const [projectSlug, setProjectSlug] = useState(scopedSlug ?? "__root__");
  const [onInbound, setOnInbound] = useState<
    "new_session" | "existing_session"
  >("new_session");
  const [sessionId, setSessionId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [eventsProjectFilter, setEventsProjectFilter] = useState<string>("__all__");

  const finalAddress =
    addressMode === "new" ? `${localPart}@${domain}` : selectedAddress;

  const { data: projectSessions } = useQuery({
    ...orpc.sessions.list.queryOptions({
      input: { slug: projectSlug },
    }),
    enabled:
      !!projectSlug &&
      projectSlug !== "__root__" &&
      onInbound === "existing_session",
  });

  const { data: rootSessions } = useQuery({
    ...orpc.root.sessions.queryOptions({ input: {} }),
    enabled: projectSlug === "__root__" && onInbound === "existing_session",
  });

  const sessions = projectSlug === "__root__" ? rootSessions : projectSessions;

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: orpc.email.listConfigs.queryOptions().queryKey,
    });
    void queryClient.invalidateQueries({
      queryKey: orpc.email.events.queryOptions({ input: {} }).queryKey,
    });
    void queryClient.invalidateQueries({
      queryKey: orpc.email.domain.queryOptions().queryKey,
    });
  };

  const saveConfig = useMutation({
    mutationFn: () =>
      client.email.setConfig({
        projectSlug,
        address: finalAddress,
        enabled: true,
        prompt,
        onInbound,
        ...(sessionId ? { sessionId } : {}),
      }),
    onSuccess: () => {
      invalidate();
      setLocalPart("");
      setSelectedAddress("");
      if (!scopedSlug) setProjectSlug("__root__");
      setOnInbound("new_session");
      setSessionId("");
      setPrompt("");
    },
  });

  const removeConfig = useMutation({
    mutationFn: (slug: string) =>
      client.email.removeConfig({ projectSlug: slug }),
    onSuccess: invalidate,
  });

  const toggleConfig = useMutation({
    mutationFn: (cfg: {
      projectSlug: string;
      address: string;
      enabled: boolean;
      prompt: string;
      onInbound: "new_session" | "existing_session";
      sessionId?: string;
    }) => client.email.setConfig({ ...cfg, enabled: !cfg.enabled }),
    onSuccess: invalidate,
  });

  const canSave =
    addressMode === "new"
      ? localPart.length > 0 && prompt.length > 0
      : selectedAddress.length > 0 && prompt.length > 0;

  // Scoped filtering
  const displayConfigs = useMemo(
    () => {
      if (scopedSlug) return configs?.filter((c) => c.projectSlug === scopedSlug);
      if (eventsProjectFilter !== "__all__")
        return configs?.filter((c) => c.projectSlug === eventsProjectFilter);
      return configs;
    },
    [configs, scopedSlug, eventsProjectFilter]
  );

  const displayEvents = useMemo(
    () => {
      if (scopedSlug) return events?.filter((ev) => ev.projectSlug === scopedSlug);
      if (eventsProjectFilter !== "__all__")
        return events?.filter((ev) => ev.projectSlug === eventsProjectFilter);
      return events;
    },
    [events, scopedSlug, eventsProjectFilter]
  );

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-semibold">Email</h1>

      {/* Domain status banner */}
      <div className="mb-4 flex items-center gap-2 text-sm">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${isDomainConfigured ? "bg-green-500" : "bg-yellow-500"}`}
        />
        <span className="text-muted-foreground">
          {isDomainConfigured ? (
            <>
              Receiving at{" "}
              <span className="font-medium text-foreground">@{domain}</span>
            </>
          ) : (
            <>
              No domain configured —{" "}
              <span className="font-medium text-yellow-500">
                set CHANNEL_EMAIL_DOMAIN
              </span>
            </>
          )}
        </span>
      </div>

      {/* Create/Edit form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>New Email Route</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Address */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium text-muted-foreground">
                Address
              </span>
              <div className="flex items-center gap-2">
                {existingAddresses.length > 0 && (
                  <select
                    value={addressMode}
                    onChange={(e) =>
                      setAddressMode(e.target.value as "new" | "existing")
                    }
                    className="h-8 shrink-0 rounded-none border bg-background px-2 text-xs"
                  >
                    <option value="new">New</option>
                    <option value="existing">Existing</option>
                  </select>
                )}
                {addressMode === "new" ? (
                  <InputGroup className="max-w-xs">
                    <InputGroupInput
                      placeholder="support"
                      value={localPart}
                      onChange={(e) => setLocalPart(e.target.value)}
                    />
                    <InputGroupAddon align="inline-end">
                      @{domain}
                    </InputGroupAddon>
                  </InputGroup>
                ) : (
                  <select
                    value={selectedAddress}
                    onChange={(e) => setSelectedAddress(e.target.value)}
                    className="h-8 rounded-none border bg-background px-2 text-sm"
                  >
                    <option value="">Select address...</option>
                    {existingAddresses.map((addr) => (
                      <option key={addr} value={addr}>
                        {addr}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Route to + Session handling */}
            <div className="flex gap-4">
              {!scopedSlug && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground">
                    Route to
                  </span>
                  <select
                    value={projectSlug}
                    onChange={(e) => {
                      setProjectSlug(e.target.value);
                      setSessionId("");
                    }}
                    className="h-8 rounded-none border bg-background px-2 text-sm"
                  >
                    <option value="__root__">Root (catch-all)</option>
                    {projects?.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.path.split("/").slice(-2).join("/")}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-medium text-muted-foreground">
                  Session handling
                </span>
                <select
                  value={onInbound}
                  onChange={(e) => {
                    setOnInbound(e.target.value as typeof onInbound);
                    setSessionId("");
                  }}
                  className="h-8 rounded-none border bg-background px-2 text-sm"
                >
                  <option value="new_session">New session</option>
                  <option value="existing_session">Existing session</option>
                </select>
              </div>
            </div>

            {/* Session picker */}
            {onInbound === "existing_session" && (
              <select
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="h-8 rounded-none border bg-background px-2 text-sm"
              >
                <option value="">Select session...</option>
                {sessions?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstPrompt.slice(0, 50)}
                    {s.firstPrompt.length > 50 ? "..." : ""}
                  </option>
                ))}
              </select>
            )}

            {/* Agent instructions */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium text-muted-foreground">
                Agent instructions
              </span>
              <div className="flex gap-1.5">
                {PROMPT_SUGGESTIONS.map((s) => (
                  <Button
                    key={s.label}
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => setPrompt(s.prompt)}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
              <textarea
                placeholder="Agent prompt when email arrives..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[80px] rounded-none border bg-background px-3 py-2 text-sm"
              />
            </div>

            <Button
              size="sm"
              className="w-fit"
              disabled={!canSave || saveConfig.isPending}
              onClick={() => saveConfig.mutate()}
            >
              {saveConfig.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Config list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !displayConfigs || displayConfigs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No email configs.</p>
      ) : (
        <div className="mb-6 flex flex-col gap-2">
          {displayConfigs.map((cfg) => (
            <Card key={cfg.projectSlug} size="sm">
              <CardContent className="flex items-center gap-3 py-3">
                <button
                  onClick={() => toggleConfig.mutate(cfg)}
                  className={`h-3 w-3 shrink-0 rounded-full border ${cfg.enabled ? "bg-green-500 border-green-600" : "bg-muted border-muted-foreground/30"}`}
                  title={cfg.enabled ? "Disable" : "Enable"}
                />
                <span className="shrink-0 text-sm font-medium">
                  {cfg.address}
                </span>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {cfg.onInbound}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {cfg.prompt}
                </span>
                {!scopedSlug && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {cfg.projectSlug === "__root__"
                      ? "root"
                      : cfg.projectSlug
                          .replace(/-/g, "/")
                          .split("/")
                          .slice(-2)
                          .join("/")}
                  </span>
                )}
                <button
                  onClick={() => removeConfig.mutate(cfg.projectSlug)}
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
            </Card>
          ))}
        </div>
      )}

      {/* Email events log */}
      {((displayEvents && displayEvents.length > 0) || scopedSlug || eventsProjectFilter !== "__all__") && (
        <>
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Recent Email Events
            </h2>
            {!scopedSlug && (
              <select
                value={eventsProjectFilter}
                onChange={(e) => setEventsProjectFilter(e.target.value)}
                className="h-7 rounded-none border bg-background px-2 text-xs"
              >
                <option value="__all__">All projects</option>
                {projects?.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.path.split("/").pop() ?? p.slug}
                  </option>
                ))}
              </select>
            )}
          </div>
          {displayEvents && displayEvents.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {displayEvents.slice(0, 50).map((ev) => {
                const href = ev.sessionId
                  ? ev.projectSlug === "__root__" ||
                    ev.projectSlug === "__outbound__"
                    ? `/chat/${ev.sessionId}`
                    : `/project/${ev.projectSlug}/chat/${ev.sessionId}`
                  : null;
                const rowClass = `flex flex-wrap items-center gap-x-2 gap-y-1 rounded border px-2 py-1.5${href ? " cursor-pointer hover:bg-muted/50" : ""}`;
                const children = (
                  <>
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${ev.status === "success" ? "bg-green-500" : ev.status === "error" ? "bg-red-500" : "bg-yellow-500 animate-pulse"}`}
                    />
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {getTimeAgo(ev.timestamp)}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {ev.direction}
                    </Badge>
                    {!scopedSlug && (
                      <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                        {ev.projectSlug === "__root__" || ev.projectSlug === "__outbound__"
                          ? "root"
                          : projects?.find((p) => p.slug === ev.projectSlug)?.path.split("/").pop()
                              ?? ev.projectSlug}
                      </span>
                    )}
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {ev.from}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      &rarr; {ev.to}
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
                    {ev.subject && (
                      <span className="hidden sm:block min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                        {ev.subject}
                      </span>
                    )}
                    {href && (
                      <span className="hidden sm:block shrink-0 text-[10px] font-medium text-blue-500">
                        session &rarr;
                      </span>
                    )}
                  </>
                );
                return href ? (
                  <Link key={ev.id} href={href} className={rowClass}>
                    {children}
                  </Link>
                ) : (
                  <div key={ev.id} className={rowClass}>
                    {children}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No email events yet.</p>
          )}
        </>
      )}
    </div>
  );
}
