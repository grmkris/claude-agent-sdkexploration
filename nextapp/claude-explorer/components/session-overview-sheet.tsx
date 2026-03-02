"use client";

import { useQuery } from "@tanstack/react-query";

import type { SessionInitMeta } from "@/lib/types";

import {
  ACTIVE_STATES,
  barColor,
  formatCost,
  formatTokens,
} from "@/components/context-bar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { orpc } from "@/lib/orpc";

// ---------------------------------------------------------------------------
// SessionOverviewSheet
// ---------------------------------------------------------------------------

export function SessionOverviewSheet({
  open,
  onOpenChange,
  sessionId,
  sessionMeta,
  currentPermissionMode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
  sessionMeta: SessionInitMeta | null;
  currentPermissionMode?: string | null;
}) {
  // Live session data from the server
  const { data } = useQuery({
    ...orpc.liveState.session.queryOptions({
      input: { sessionId: sessionId ?? "" },
    }),
    enabled: !!sessionId && open,
    refetchInterval: 5_000,
  });

  const contextWindow = data?.context_window ?? null;
  const maxContextWindow = data?.max_context_window ?? null;
  const hasCw =
    contextWindow !== null && maxContextWindow !== null && maxContextWindow > 0;
  const pct = hasCw ? contextWindow! / maxContextWindow! : null;
  const isActive = !!data?.state && ACTIVE_STATES.has(data.state);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Session Overview</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pb-6">
          {/* ── Session Info ─────────────────────────────────── */}
          <Section title="Session">
            <InfoRow label="Status">
              {isActive ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="capitalize text-green-600 dark:text-green-400">
                    {data?.state?.replace(/_/g, " ")}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">Idle</span>
              )}
            </InfoRow>
            {(sessionMeta?.model || data?.model) && (
              <InfoRow label="Model">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  {sessionMeta?.model || data?.model}
                </span>
              </InfoRow>
            )}
            {currentPermissionMode && (
              <InfoRow label="Permission mode">
                <span className="capitalize">{currentPermissionMode}</span>
              </InfoRow>
            )}
            {sessionMeta?.cwd && (
              <InfoRow label="Working dir">
                <span className="font-mono text-[10px] break-all">
                  {sessionMeta.cwd}
                </span>
              </InfoRow>
            )}
            {sessionMeta?.claudeCodeVersion && (
              <InfoRow label="CC version">
                {sessionMeta.claudeCodeVersion}
              </InfoRow>
            )}
          </Section>

          {/* ── Context & Usage ──────────────────────────────── */}
          {(hasCw || data?.input_tokens != null || data?.cost_usd != null) && (
            <Section title="Context & Usage">
              {hasCw && pct !== null && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Context window</span>
                    <span
                      className={
                        pct >= 0.9
                          ? "font-medium text-red-500"
                          : pct >= 0.7
                            ? "text-yellow-500"
                            : ""
                      }
                    >
                      {(pct * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${barColor(pct)}`}
                      style={{
                        width: `${Math.min(pct * 100, 100).toFixed(1)}%`,
                      }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground/70">
                    {formatTokens(contextWindow!)} /{" "}
                    {formatTokens(maxContextWindow!)} tokens
                  </div>
                </div>
              )}
              {data?.input_tokens != null && (
                <InfoRow label="Input tokens">
                  {formatTokens(data.input_tokens)}
                </InfoRow>
              )}
              {data?.output_tokens != null && (
                <InfoRow label="Output tokens">
                  {formatTokens(data.output_tokens)}
                </InfoRow>
              )}
              {data?.cost_usd != null && data.cost_usd > 0 && (
                <InfoRow label="Cost">{formatCost(data.cost_usd)}</InfoRow>
              )}
            </Section>
          )}

          {/* ── MCP Servers ──────────────────────────────────── */}
          {sessionMeta && sessionMeta.mcpServers.length > 0 && (
            <Section title="MCP Servers">
              <div className="flex flex-col gap-1">
                {sessionMeta.mcpServers.map((mcp) => (
                  <div
                    key={mcp.name}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-xs"
                  >
                    <span
                      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                        mcp.status === "connected"
                          ? "bg-green-500"
                          : mcp.status === "connecting"
                            ? "bg-yellow-500 animate-pulse"
                            : "bg-red-500"
                      }`}
                    />
                    <span className="flex-1 truncate">{mcp.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground capitalize">
                      {mcp.status}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── Skills & Commands ─────────────────────────────── */}
          {sessionMeta &&
            (sessionMeta.skills.length > 0 ||
              sessionMeta.slashCommands.length > 0) && (
              <Section title="Skills & Commands">
                <div className="flex flex-wrap gap-1.5">
                  {sessionMeta.skills.map((s) => (
                    <Pill key={`skill:${s}`} label={s} kind="skill" />
                  ))}
                  {sessionMeta.slashCommands.map((c) => (
                    <Pill key={`cmd:${c}`} label={`/${c}`} kind="command" />
                  ))}
                </div>
              </Section>
            )}

          {/* ── Tools ─────────────────────────────────────────── */}
          {sessionMeta && sessionMeta.tools.length > 0 && (
            <Section title={`Tools (${sessionMeta.tools.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {sessionMeta.tools.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-muted/70 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </Section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {title}
      </h3>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{children}</span>
    </div>
  );
}

function Pill({ label, kind }: { label: string; kind: "skill" | "command" }) {
  return (
    <span
      className={[
        "rounded-full border px-2 py-0.5 text-[10px] font-medium",
        kind === "skill"
          ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      ].join(" ")}
    >
      {label}
    </span>
  );
}
