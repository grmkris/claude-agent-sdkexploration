"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { orpc } from "@/lib/orpc";
import { generateTmuxCommand } from "@/lib/tmux-command";

export interface SessionActionData {
  sessionId: string;
  resumeCommand: string;
  /** Project path extracted from resumeCommand or passed directly */
  projectPath?: string | null;
}

function EllipsisIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * Unified session actions dropdown — used in the sidebar sessions panel
 * and on session cards. Opens instantly (no animation delay vs Popover).
 *
 * Pass children to use as a custom trigger, or leave empty to get the
 * default ⋯ ellipsis button.
 */
export function SessionActionsMenu({
  session,
  onArchive,
  children,
  triggerClassName,
}: {
  session: SessionActionData;
  onArchive?: () => void;
  children?: React.ReactNode;
  triggerClassName?: string;
}) {
  const [copiedResume, setCopiedResume] = useState(false);
  const [copiedTmux, setCopiedTmux] = useState(false);

  const { data: serverConfig } = useQuery(orpc.server.config.queryOptions());

  // Extract project path from resumeCommand if not passed directly:
  // resumeCommand format: "cd /path && claude --resume <id>"
  const projectPath =
    session.projectPath !== undefined
      ? session.projectPath
      : session.resumeCommand.split(" && ")[0]?.replace("cd ", "") ?? null;

  const safePath = projectPath?.includes(" ")
    ? `"${projectPath}"`
    : projectPath;

  const tmuxCmd = safePath
    ? generateTmuxCommand({
        sessionName: `claude-${session.sessionId.slice(0, 8)}`,
        projectPath: safePath,
        panelCount: 1,
        layout: "even-horizontal",
        resumeSessionIds: [session.sessionId],
        sshTarget: serverConfig?.sshHost ?? undefined,
      })
    : null;

  const handleCopyResume = () => {
    void navigator.clipboard.writeText(session.resumeCommand);
    setCopiedResume(true);
    setTimeout(() => setCopiedResume(false), 1500);
  };

  const handleCopyTmux = () => {
    if (!tmuxCmd) return;
    void navigator.clipboard.writeText(tmuxCmd);
    setCopiedTmux(true);
    setTimeout(() => setCopiedTmux(false), 1500);
  };

  const defaultTriggerClass =
    triggerClassName ??
    "rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={children ? undefined : defaultTriggerClass}
        title={children ? undefined : "Session actions"}
      >
        {children ?? <EllipsisIcon className="h-3.5 w-3.5" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end">
        <DropdownMenuItem onSelect={handleCopyResume}>
          {copiedResume ? (
            <CheckIcon className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <span className="h-3.5 w-3.5 text-center text-[11px]">⌘</span>
          )}
          Copy resume command
        </DropdownMenuItem>
        {tmuxCmd && (
          <DropdownMenuItem onSelect={handleCopyTmux}>
            {copiedTmux ? (
              <CheckIcon className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <span className="h-3.5 w-3.5 text-center text-[11px]">▶</span>
            )}
            Copy tmux command
          </DropdownMenuItem>
        )}
        {onArchive && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onArchive}
              variant="destructive"
            >
              <span className="h-3.5 w-3.5 text-center text-[11px]">☰</span>
              Archive session
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
