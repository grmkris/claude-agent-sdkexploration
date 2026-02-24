"use client";

import { useQuery } from "@tanstack/react-query";

import { CopyButton } from "@/components/copy-button";
import { orpc } from "@/lib/orpc";
import { generateAttachCommand } from "@/lib/tmux-command";

export function SshBadge() {
  const { data } = useQuery(orpc.server.config.queryOptions());
  const { data: panes } = useQuery({
    ...orpc.tmux.panes.queryOptions(),
    refetchInterval: 30_000,
  });

  if (!data?.sshHost) return null;

  // Pick the first active tmux session name if any panes are running
  const activeSessions = panes?.map((p) => p.session).filter(Boolean) ?? [];
  const firstSession = activeSessions[0];

  const command = generateAttachCommand({
    sessionName: firstSession ?? "",
    sshTarget: data.sshHost,
  });

  // Short label: show just the tmux portion
  const label = firstSession ? `tmux attach -t ${firstSession}` : "tmux attach";

  return (
    <div className="ml-auto flex items-center gap-1.5">
      <code className="text-[11px] text-muted-foreground font-mono">
        {label}
      </code>
      <CopyButton text={command} />
    </div>
  );
}
