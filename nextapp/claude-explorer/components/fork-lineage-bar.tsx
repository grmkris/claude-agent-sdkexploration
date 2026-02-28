"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { orpc } from "@/lib/orpc";

function getSessionUrl(sessionId: string, projectSlug?: string): string {
  if (!projectSlug || projectSlug === "__root__") {
    return `/chat/${sessionId}`;
  }
  return `/project/${projectSlug}/chat/${sessionId}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

export function ForkLineageBar({
  sessionId,
  projectSlug,
}: {
  sessionId: string;
  projectSlug?: string;
}) {
  const router = useRouter();
  const { data: ancestry } = useQuery({
    ...orpc.sessions.ancestry.queryOptions({ input: { sessionId } }),
    staleTime: 60_000,
  });

  const parentId = ancestry?.[0]?.id;

  const { data: siblings } = useQuery({
    ...orpc.sessions.forks.queryOptions({
      input: { sessionId: parentId! },
    }),
    enabled: !!parentId,
    staleTime: 60_000,
  });

  const { data: children } = useQuery({
    ...orpc.sessions.forks.queryOptions({ input: { sessionId } }),
    staleTime: 60_000,
  });

  // Don't render if there's no fork lineage at all
  if (!ancestry?.length && !children?.length) return null;

  const otherSiblings = siblings?.filter((s) => s.id !== sessionId) ?? [];

  return (
    <div className="flex items-center gap-1.5 border-b px-3 py-1.5 text-[11px] text-muted-foreground">
      <span className="shrink-0">⑂</span>

      {/* Ancestry breadcrumbs */}
      {ancestry
        ?.slice()
        .reverse()
        .map((ancestor) => (
          <Fragment key={ancestor.id}>
            <Link
              href={getSessionUrl(ancestor.id, projectSlug)}
              className="truncate max-w-32 hover:text-foreground hover:underline transition-colors"
              title={ancestor.firstPrompt}
            >
              {truncate(ancestor.firstPrompt || "Session", 28)}
            </Link>
            <span className="text-muted-foreground/50">/</span>
          </Fragment>
        ))}

      <span className="font-medium text-foreground truncate max-w-40">
        Current
      </span>

      {/* Sibling forks dropdown */}
      {otherSiblings.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] hover:bg-accent hover:text-foreground transition-colors">
            +{otherSiblings.length} sibling
            {otherSiblings.length > 1 ? "s" : ""}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {otherSiblings.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onSelect={() => router.push(getSessionUrl(s.id, projectSlug))}
              >
                <span className="truncate">
                  {truncate(s.firstPrompt || "Session", 40)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Children forks count */}
      {children && children.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger className="ml-auto rounded px-1.5 py-0.5 text-[10px] hover:bg-accent hover:text-foreground transition-colors">
            {children.length} fork{children.length > 1 ? "s" : ""}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {children.map((c) => (
              <DropdownMenuItem
                key={c.id}
                onSelect={() => router.push(getSessionUrl(c.id, projectSlug))}
              >
                <span className="truncate">
                  {truncate(c.firstPrompt || "Forked session", 40)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
