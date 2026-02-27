"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";

import { CopyButton } from "@/components/copy-button";
import { orpc } from "@/lib/orpc";

export function SshBadge() {
  const { data } = useQuery(orpc.server.config.queryOptions());
  const pathname = usePathname();

  // Extract session ID before any early returns so hooks are called unconditionally
  // Matches /chat/:id or /project/:slug/chat/:id
  const chatMatch = pathname.match(/\/chat\/([^/]+)$/);
  const sessionId = chatMatch?.[1];

  // Fetch session data to get project_path for the correct working directory
  const { data: sessionData } = useQuery({
    ...orpc.liveState.session.queryOptions({ input: { sessionId: sessionId ?? "" } }),
    enabled: !!sessionId,
  });

  if (!data?.sshHost) return null;

  let command: string;
  let label: string;

  if (sessionId) {
    const shortId = sessionId.slice(0, 8);
    const sessionName = `claude-${shortId}`;
    const safePath = sessionData?.project_path?.includes(" ")
      ? `"${sessionData.project_path}"`
      : (sessionData?.project_path ?? null);
    const innerCmd = safePath
      ? `tmux new-session -s ${sessionName} -c ${safePath} 'claude --resume ${sessionId}'`
      : `tmux new-session -s ${sessionName} 'claude --resume ${sessionId}'`;
    command = `ssh -t ${data.sshHost} '${innerCmd}'`;
    label = `tmux new-session ${sessionName}`;
  } else {
    command = `ssh ${data.sshHost}`;
    label = `ssh ${data.sshHost}`;
  }

  return (
    <div className="ml-auto flex items-center gap-1.5">
      <code className="text-[11px] text-muted-foreground font-mono">
        {label}
      </code>
      <CopyButton text={command} />
    </div>
  );
}
