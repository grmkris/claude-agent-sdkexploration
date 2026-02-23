"use client";

import { useQuery } from "@tanstack/react-query";

import { CopyButton } from "@/components/copy-button";
import { orpc } from "@/lib/orpc";

export function SshBadge() {
  const { data } = useQuery(orpc.server.config.queryOptions());

  if (!data?.sshHost) return null;

  const sshCommand = `ssh ${data.sshHost}`;

  return (
    <div className="ml-auto flex items-center gap-1.5">
      <code className="text-[11px] text-muted-foreground font-mono">
        {sshCommand}
      </code>
      <CopyButton text={sshCommand} />
    </div>
  );
}
