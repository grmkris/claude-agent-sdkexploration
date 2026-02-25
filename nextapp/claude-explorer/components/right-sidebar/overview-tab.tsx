"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { OpenInCursorButton } from "@/components/open-in-cursor-button";
import { IntegrationWidgets } from "@/components/project-integrations";
import { SessionStateBadge } from "@/components/session-state-badge";
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
                <SessionStateBadge sessionId={primarySession.id} compact />
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
                  <SessionStateBadge sessionId={session.id} compact />
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

// ── Recent conversations ──────────────────────────────────────────────────────
// When a project slug is provided we show only that project's sessions
// (sessions.list).  On the root/global view we show all recent sessions
// (sessions.recent).

function RecentSection({ slug }: { slug: string | null }) {
  const pathname = usePathname();

  // Project-scoped: use sessions.list so we only show this project's sessions.
  const { data: projectSessions, isLoading: projectLoading } = useQuery({
    ...orpc.sessions.list.queryOptions({ input: { slug: slug ?? "", limit: 30 } }),
    refetchInterval: 30_000,
    enabled: !!slug,
  });

  // Global view: use sessions.recent when not inside a project.
  const { data: recentSessions, isLoading: recentLoading } = useQuery({
    ...orpc.sessions.recent.queryOptions({ input: { limit: 30 } }),
    refetchInterval: 30_000,
    enabled: !slug,
  });

  const sessions = slug ? projectSessions : recentSessions;
  const isLoading = slug ? projectLoading : recentLoading;

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
            // Project-scoped sessions: always route into the current project.
            // Global sessions: use session.projectSlug (nullable → root route).
            const href = slug
              ? `/project/${slug}/chat/${session.id}`
              : ("projectSlug" in session && session.projectSlug)
                ? `/project/${session.projectSlug}/chat/${session.id}`
                : `/chat/${session.id}`;
            const isActive = pathname.includes(session.id);

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
              </Link>
            );
          })}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// ── Integration widgets (Railway, Linear, GitHub) ────────────────────────────

function IntegrationsSection({ slug }: { slug: string }) {
  const { data: integrations } = useQuery({
    ...orpc.integrations.list.queryOptions(),
    refetchInterval: 60_000,
  });

  const projectIntegrations =
    integrations?.filter((i) => i.projectSlug === slug && i.enabled) ?? [];

  if (projectIntegrations.length === 0) return null;

  return (
    <SidebarGroup>
      <div className="px-2 pb-1 text-[11px] font-medium text-sidebar-foreground/70">
        Integrations
      </div>
      <SidebarGroupContent>
        <div className="flex flex-col gap-3 px-2">
          {projectIntegrations.map((integration) => (
            <div key={integration.id}>
              <div className="mb-1 text-[10px] capitalize text-muted-foreground">
                {integration.type} · {integration.name}
              </div>
              <IntegrationWidgets integrationId={integration.id} />
            </div>
          ))}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// ── Open in Cursor ────────────────────────────────────────────────────────────

/**
 * Shown when inside a project — fetches the project's filesystem path and
 * renders an "Open in Cursor" deep-link using the configured SSH host.
 */
function ProjectCursorSection({ slug }: { slug: string }) {
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const { data: serverConfig } = useQuery(orpc.server.config.queryOptions());

  const project = projects?.find((p) => p.slug === slug);
  if (!project?.path) return null;

  return (
    <div className="px-2">
      <OpenInCursorButton
        path={project.path}
        sshHost={serverConfig?.sshHost}
        className="w-full justify-center"
      />
    </div>
  );
}

/**
 * Shown on the root/home view — opens the home directory in Cursor.
 */
function RootCursorSection() {
  const { data: serverConfig } = useQuery(orpc.server.config.queryOptions());

  if (!serverConfig?.homeDir) return null;

  return (
    <div className="px-2">
      <OpenInCursorButton
        path={serverConfig.homeDir}
        sshHost={serverConfig.sshHost}
        className="w-full justify-center"
      />
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function OverviewTab({ slug }: { slug: string | null }) {
  const newChatHref = slug ? `/project/${slug}/chat` : "/chat";

  return (
    <div className="flex flex-col gap-2 py-2">
      {/* New conversation — always at the top */}
      <div className="px-2">
        <Link href={newChatHref}>
          <Button size="sm" className="w-full">
            New Conversation
          </Button>
        </Link>
      </div>

      {/* Open in Cursor — context-aware */}
      {slug ? <ProjectCursorSection slug={slug} /> : <RootCursorSection />}

      {slug ? (
        <>
          <ProjectAutomationsSection slug={slug} />
          <IntegrationsSection slug={slug} />
        </>
      ) : (
        <>
          <GlobalAutomationsSection />
          <RootSessionSection />
        </>
      )}
      <RecentSection slug={slug} />
    </div>
  );
}
