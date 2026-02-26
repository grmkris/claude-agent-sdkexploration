"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { orpc } from "@/lib/orpc";
import { generateAttachCommand } from "@/lib/tmux-command";
import { cn } from "@/lib/utils";

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function TmuxSessionsPanel({
  filterProjectPath,
}: {
  filterProjectPath?: string | null;
}) {
  const [copiedSession, setCopiedSession] = useState<string | null>(null);

  const { data: sessions, isLoading } = useQuery({
    ...orpc.tmux.sessions.queryOptions(),
    refetchInterval: 15_000,
  });

  const { data: serverConfig } = useQuery(orpc.server.config.queryOptions());

  // Project-scoped filter: match sessions whose name contains the last dir segment
  const projectDirName = filterProjectPath?.split("/").at(-1);
  const filtered = projectDirName
    ? sessions?.filter((s) => s.name.includes(projectDirName))
    : sessions;

  if (isLoading) {
    return (
      <div className="px-3 py-1 text-xs text-muted-foreground animate-pulse">
        Loading…
      </div>
    );
  }

  if (!filtered?.length) return null;

  return (
    <div className="flex flex-col gap-0.5 px-1">
      {filtered.map((session) => {
        const attachCmd = generateAttachCommand({
          sessionName: session.name,
          sshTarget: serverConfig?.sshHost ?? undefined,
        });
        const copied = copiedSession === session.name;

        return (
          <div
            key={session.name}
            className="flex items-center gap-2 rounded py-1 px-1 text-xs hover:bg-sidebar-accent transition-colors"
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                session.attached ? "bg-green-400" : "bg-muted-foreground/40"
              )}
            />
            <span className="flex-1 truncate font-mono text-[11px]">
              {session.name}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground/60">
              {session.windows}w
            </span>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(attachCmd);
                setCopiedSession(session.name);
                setTimeout(() => setCopiedSession(null), 1500);
              }}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title={attachCmd}
            >
              {copied ? (
                <CheckIcon className="h-3 w-3 text-green-400" />
              ) : (
                <CopyIcon className="h-3 w-3" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
