"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { getTimeAgo } from "@/lib/utils";

export default function EmailPage() {
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

  const [address, setAddress] = useState("");
  const [projectSlug, setProjectSlug] = useState("__root__");
  const [onInbound, setOnInbound] = useState<
    "new_session" | "existing_session"
  >("new_session");
  const [sessionId, setSessionId] = useState("");
  const [prompt, setPrompt] = useState("");

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
  };

  const saveConfig = useMutation({
    mutationFn: () =>
      client.email.setConfig({
        projectSlug,
        address,
        enabled: true,
        prompt,
        onInbound,
        ...(sessionId ? { sessionId } : {}),
      }),
    onSuccess: () => {
      invalidate();
      setAddress("");
      setProjectSlug("__root__");
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

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-semibold">Email</h1>

      {/* Create/Edit form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>New Email Config</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input
                placeholder="agent@yourdomain.com"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-64"
              />
              <select
                value={projectSlug}
                onChange={(e) => {
                  setProjectSlug(e.target.value);
                  setSessionId("");
                }}
                className="rounded border bg-background px-2 text-sm"
              >
                <option value="__root__">Root (catch-all)</option>
                {projects?.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.path.split("/").slice(-2).join("/")}
                  </option>
                ))}
              </select>
              <select
                value={onInbound}
                onChange={(e) => {
                  setOnInbound(e.target.value as typeof onInbound);
                  setSessionId("");
                }}
                className="rounded border bg-background px-2 text-sm"
              >
                <option value="new_session">New session</option>
                <option value="existing_session">Existing session</option>
              </select>
            </div>
            <div className="flex gap-2">
              <select
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="shrink-0 rounded border bg-background px-2 text-sm"
                disabled={onInbound !== "existing_session"}
              >
                <option value="">Select session...</option>
                {sessions?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstPrompt.slice(0, 50)}
                    {s.firstPrompt.length > 50 ? "..." : ""}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              placeholder="Agent prompt when email arrives..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[80px] rounded border bg-background px-3 py-2 text-sm"
            />
            <Button
              size="sm"
              className="w-fit"
              disabled={!address || !prompt || saveConfig.isPending}
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
      ) : !configs || configs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No email configs.</p>
      ) : (
        <div className="mb-6 flex flex-col gap-2">
          {configs.map((cfg) => (
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
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {cfg.projectSlug === "__root__"
                    ? "root"
                    : cfg.projectSlug
                        .replace(/-/g, "/")
                        .split("/")
                        .slice(-2)
                        .join("/")}
                </span>
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
      {events && events.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Recent Email Events
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
                  {ev.direction}
                </Badge>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {ev.from}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  &rarr; {ev.to}
                </span>
                {ev.subject && (
                  <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                    {ev.subject}
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
                {ev.sessionId && (
                  <span className="shrink-0 text-[10px] text-blue-400">
                    session
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
