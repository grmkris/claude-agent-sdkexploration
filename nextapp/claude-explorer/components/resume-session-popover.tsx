"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import type { Project } from "@/lib/types";

import { CopyButton } from "@/components/copy-button";
import { StateBadgeInline } from "@/components/session-state-badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { orpc } from "@/lib/orpc";
import { getTimeAgo } from "@/lib/utils";

export interface LiveSession {
  session_id: string;
  project_path: string | null;
  state: string;
  current_tool: string | null;
  first_prompt: string | null;
  updated_at: string;
}

/** Find the registered project whose path is a prefix of the given cwd. */
function getProjectSlugForPath(
  projectPath: string,
  projects: Project[]
): string | null {
  const match = projects.find(
    (p) => projectPath === p.path || projectPath.startsWith(p.path + "/")
  );
  return match?.slug ?? null;
}

/** Build the correct in-app URL for a live session. */
export function getSessionUrl(
  session: Pick<LiveSession, "session_id" | "project_path">,
  projects: Project[]
): string {
  if (!session.project_path) return `/chat/${session.session_id}`;
  const slug = getProjectSlugForPath(session.project_path, projects);
  if (!slug) return `/chat/${session.session_id}`;
  return `/project/${slug}/chat/${session.session_id}`;
}

function CommandRow({ label, cmd }: { label: string; cmd: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex items-start gap-1.5 rounded bg-muted/50 px-2 py-1.5">
        <code className="min-w-0 flex-1 select-all break-all font-mono text-[10px] leading-tight">
          {cmd}
        </code>
        <CopyButton text={cmd} />
      </div>
    </div>
  );
}

/**
 * Wraps any children as a popover trigger. On click, shows:
 *  - "View in browser" → correct project-scoped URL (fixes /chat vs /project/.../chat)
 *  - Copyable resume commands: plain / skip-permissions / -CC (iTerm2) / SSH variants
 */
export function ResumeSessionPopover({
  session,
  children,
}: {
  session: LiveSession;
  children: React.ReactNode;
}) {
  const { data: projects = [] } = useQuery(orpc.projects.list.queryOptions());
  const { data: serverConfig } = useQuery(orpc.server.config.queryOptions());

  const sessionUrl = getSessionUrl(session, projects);
  const { project_path: projectPath, session_id: sessionId } = session;
  const sshHost = serverConfig?.sshHost;

  // Shell-safe path (quote if it contains spaces)
  const safePath = projectPath?.includes(" ")
    ? `"${projectPath}"`
    : projectPath;
  const cdPrefix = safePath ? `cd ${safePath} && ` : "";

  const plainCmd = `${cdPrefix}claude --resume ${sessionId}`;
  const skipPermsCmd = `${cdPrefix}claude --resume ${sessionId} --dangerously-skip-permissions`;
  const ccCmd = safePath
    ? `tmux -CC new-session -s r-${sessionId.slice(0, 6)} -c ${safePath} 'claude --resume ${sessionId} --dangerously-skip-permissions'`
    : `tmux -CC new-session -s r-${sessionId.slice(0, 6)} 'claude --resume ${sessionId} --dangerously-skip-permissions'`;

  const escapeSingle = (s: string) => s.replace(/'/g, "'\\''");
  const sshCmd = sshHost
    ? `ssh -t ${sshHost} '${escapeSingle(skipPermsCmd)}'`
    : null;
  const sshCcCmd = sshHost
    ? `ssh -t ${sshHost} '${escapeSingle(ccCmd)}'`
    : null;

  return (
    <Popover>
      {/* render as div so we don't nest a <button> inside other interactive elements */}
      <PopoverTrigger render={<div />}>{children}</PopoverTrigger>

      <PopoverContent className="w-[26rem]" side="bottom" align="start">
        <div className="flex flex-col gap-3">
          {/* ── Session header ── */}
          <div className="flex items-start gap-2">
            <StateBadgeInline
              state={session.state}
              currentTool={session.current_tool}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium leading-tight">
                {session.first_prompt ?? "Session starting…"}
              </p>
              {projectPath && (
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {projectPath.split("/").slice(-3).join("/")}
                </p>
              )}
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {getTimeAgo(session.updated_at)}
            </span>
          </div>

          {/* ── View in browser ── */}
          <Link href={sessionUrl}>
            <Button size="sm" className="w-full" variant="outline">
              View in browser →
            </Button>
          </Link>

          {/* ── Resume commands ── */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              Resume in terminal
            </span>
            <CommandRow label="plain" cmd={plainCmd} />
            <CommandRow label="skip permissions" cmd={skipPermsCmd} />
            <CommandRow label="-CC  (iTerm2 / tmux control mode)" cmd={ccCmd} />
            {sshCmd && <CommandRow label="SSH" cmd={sshCmd} />}
            {sshCcCmd && <CommandRow label="SSH + -CC" cmd={sshCcCmd} />}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
