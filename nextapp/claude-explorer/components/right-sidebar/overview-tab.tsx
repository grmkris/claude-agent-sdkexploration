"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";

// ── Project-scoped automations (shown when inside a project) ─────────────────

function ProjectAutomationsSection({ slug }: { slug: string }) {
  const { data: crons } = useQuery({
    ...orpc.crons.list.queryOptions(),
    refetchInterval: 30_000,
  });
  const { data: webhooks } = useQuery({
    ...orpc.webhooks.list.queryOptions(),
    refetchInterval: 30_000,
  });

  const projectCrons =
    crons?.filter((c) => c.projectSlug === slug && c.enabled) ?? [];
  const projectWebhooks =
    webhooks?.filter((w) => w.projectSlug === slug && w.enabled) ?? [];

  if (projectCrons.length === 0 && projectWebhooks.length === 0) {
    return (
      <SidebarGroup>
        <div className="px-2 pb-1 text-[11px] font-medium text-sidebar-foreground/70">
          Automations
        </div>
        <SidebarGroupContent>
          <p className="px-2 text-[11px] text-muted-foreground">
            No active automations for this project.{" "}
            <Link href="/crons" className="hover:text-foreground underline">
              Add one
            </Link>
          </p>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <div className="px-2 pb-1 text-[11px] font-medium text-sidebar-foreground/70">
        Automations
      </div>
      <SidebarGroupContent>
        <div className="flex flex-col gap-1 px-2 text-[11px] text-muted-foreground">
          {projectCrons.map((cron) => (
            <div key={cron.id} className="flex items-center justify-between">
              <span className="truncate text-green-400">
                {cron.prompt.slice(0, 40)}
              </span>
              <span className="ml-2 shrink-0 font-mono text-[10px]">
                {cron.expression}
              </span>
            </div>
          ))}
          {projectWebhooks.map((wh) => (
            <div key={wh.id} className="flex items-center justify-between">
              <span className="truncate">{wh.name}</span>
              <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                {wh.provider}
              </span>
            </div>
          ))}
          <Link
            href="/crons"
            className="text-[10px] hover:text-foreground transition-colors"
          >
            manage →
          </Link>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// ── Global automations summary (shown on home/dashboard) ─────────────────────

function GlobalAutomationsSection() {
  const { data: crons } = useQuery({
    ...orpc.crons.list.queryOptions(),
    refetchInterval: 30_000,
  });
  const { data: webhooks } = useQuery({
    ...orpc.webhooks.list.queryOptions(),
    refetchInterval: 30_000,
  });

  const activeCrons = crons?.filter((c) => c.enabled).length ?? 0;
  const activeWebhooks = webhooks?.filter((w) => w.enabled).length ?? 0;

  if (!crons && !webhooks) return null;
  if (activeCrons === 0 && activeWebhooks === 0) return null;

  return (
    <SidebarGroup>
      <div className="px-2 pb-1 text-[11px] font-medium text-sidebar-foreground/70">
        Automations
      </div>
      <SidebarGroupContent>
        <div className="flex flex-col gap-1 px-2 text-[11px] text-muted-foreground">
          {activeCrons > 0 && (
            <div className="flex items-center justify-between">
              <span>
                <span className="text-green-400">{activeCrons}</span> cron
                {activeCrons > 1 ? "s" : ""} active
              </span>
              <Link
                href="/crons"
                className="text-[10px] hover:text-foreground transition-colors"
              >
                manage →
              </Link>
            </div>
          )}
          {activeWebhooks > 0 && (
            <div className="flex items-center justify-between">
              <span>
                <span className="text-green-400">{activeWebhooks}</span> webhook
                {activeWebhooks > 1 ? "s" : ""} active
              </span>
              <Link
                href="/webhooks"
                className="text-[10px] hover:text-foreground transition-colors"
              >
                manage →
              </Link>
            </div>
          )}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// ── Root workspace (only on home/dashboard) ───────────────────────────────────

function RootSessionSection() {
  const queryClient = useQueryClient();

  const { data: primary } = useQuery(orpc.root.primarySession.queryOptions());
  const { data: sessions } = useQuery({
    ...orpc.root.sessions.queryOptions({ input: {} }),
    refetchInterval: 15_000,
  });

  const setPrimary = useMutation({
    mutationFn: (sessionId: string | null) =>
      client.root.setPrimary({ sessionId }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orpc.root.primarySession.queryOptions().queryKey,
      }),
  });

  const primarySessionId = primary?.sessionId;
  const primarySession = sessions?.find((s) => s.id === primarySessionId);
  const otherSessions =
    sessions?.filter((s) => s.id !== primarySessionId) ?? [];

  return (
    <SidebarGroup>
      <div className="px-2 pb-1 text-[11px] font-medium text-sidebar-foreground/70">
        Root Workspace
      </div>
      <SidebarGroupContent>
        <div className="flex flex-col gap-1.5 px-2">
          {primarySession ? (
            <div className="rounded border p-2">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">
                  Primary
                </span>
                {primarySession.sessionState === "active" && (
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                )}
              </div>
              <p className="mb-1.5 truncate text-[11px]">
                {primarySession.firstPrompt}
              </p>
              <div className="flex gap-1.5">
                <Link href={`/chat/${primarySession.id}`}>
                  <Button size="sm" className="h-6 px-2 text-[10px]">
                    Continue
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setPrimary.mutate(null)}
                >
                  Unpin
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded border border-dashed p-2">
              <p className="mb-1.5 text-[11px] text-muted-foreground">
                No primary session pinned.
              </p>
              <Link href="/chat">
                <Button size="sm" className="h-6 px-2 text-[10px]">
                  New chat
                </Button>
              </Link>
            </div>
          )}

          {otherSessions.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {otherSessions.slice(0, 5).map((session) => (
                <div
                  key={session.id}
                  className="flex items-center gap-1.5 rounded px-1 py-1 hover:bg-sidebar-accent/50"
                >
                  {session.sessionState === "active" && (
                    <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-green-500" />
                  )}
                  <Link
                    href={`/chat/${session.id}`}
                    className="min-w-0 flex-1 truncate text-[11px] hover:underline"
                  >
                    {session.firstPrompt}
                  </Link>
                  <button
                    className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => setPrimary.mutate(session.id)}
                  >
                    pin
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// ── Recent conversations (always shown) ──────────────────────────────────────

function RecentSection() {
  const pathname = usePathname();
  const { data: sessions, isLoading } = useQuery({
    ...orpc.sessions.recent.queryOptions({ input: { limit: 30 } }),
    refetchInterval: 30_000,
  });

  return (
    <SidebarGroup>
      <div className="px-2 pb-1 text-[11px] font-medium text-sidebar-foreground/70">
        Recent conversations
      </div>
      <SidebarGroupContent>
        {isLoading && (
          <div className="px-2 py-2 text-[11px] animate-pulse text-muted-foreground">
            Loading…
          </div>
        )}
        {!isLoading && (!sessions || sessions.length === 0) && (
          <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
            No recent conversations
          </div>
        )}
        <div className="flex flex-col">
          {sessions?.map((session) => {
            const href = session.projectSlug
              ? `/project/${session.projectSlug}/chat/${session.id}`
              : `/chat/${session.id}`;
            const isActive = pathname.includes(session.id);
            const projectName = session.projectPath
              ? session.projectPath.split("/").at(-1)
              : null;

            return (
              <Link
                key={session.id}
                href={href}
                className={`flex min-w-0 flex-col gap-0.5 rounded px-2 py-1.5 text-[11px] transition-colors hover:bg-sidebar-accent/50 ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground"
                }`}
              >
                <span className="truncate leading-tight">
                  {session.firstPrompt.slice(0, 60) || "Untitled conversation"}
                </span>
                {projectName && (
                  <span className="truncate text-[10px] text-muted-foreground">
                    {projectName}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function OverviewTab({ slug }: { slug: string | null }) {
  return (
    <div className="flex flex-col gap-2 py-2">
      {slug ? (
        <ProjectAutomationsSection slug={slug} />
      ) : (
        <>
          <GlobalAutomationsSection />
          <RootSessionSection />
        </>
      )}
      <RecentSection />
    </div>
  );
}
