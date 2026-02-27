"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";

import { orpc } from "@/lib/orpc";

const DockerTerminal = dynamic(
  () => import("./docker-terminal").then((m) => m.DockerTerminal),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading terminal…
      </div>
    ),
  }
);

interface TerminalContentProps {
  /** Project slug — if provided, shell opens in that project's directory. */
  projectSlug?: string;
}

export function TerminalContent({ projectSlug }: TerminalContentProps) {
  const { data: projects } = useQuery({
    ...orpc.projects.list.queryOptions(),
    enabled: !!projectSlug,
  });

  const cwd = projectSlug
    ? projects?.find((p) => p.slug === projectSlug)?.path
    : undefined;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b px-4 py-3">
        <h1 className="text-sm font-semibold">Terminal</h1>
        {cwd && (
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {cwd}
          </p>
        )}
      </div>
      <div className="flex-1 overflow-hidden p-2">
        <DockerTerminal
          cwd={cwd}
          className="h-full w-full overflow-hidden rounded border border-border"
        />
      </div>
    </div>
  );
}
