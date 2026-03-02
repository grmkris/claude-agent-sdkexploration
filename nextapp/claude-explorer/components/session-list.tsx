"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";

import { SessionCard } from "./session-card";

export function SessionList({ projectSlug }: { projectSlug: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: sessions, isLoading } = useQuery({
    ...orpc.sessions.list.queryOptions({ input: { slug: projectSlug } }),
    refetchInterval: 30_000,
  });
  const { data: favorites } = useQuery(orpc.favorites.get.queryOptions());

  const sessionIds = useMemo(
    () => sessions?.map((s) => s.id) ?? [],
    [sessions]
  );
  const { data: facets } = useQuery({
    ...orpc.analytics.facets.queryOptions({ input: { sessionIds } }),
    enabled: sessionIds.length > 0,
    // Re-read facet files periodically so auto-generated titles appear
    // within ~30s of the first message (title gen takes ~6s via Haiku).
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const facetMap = useMemo(() => {
    const m = new Map<
      string,
      typeof facets extends (infer T)[] | undefined ? T : never
    >();
    for (const f of facets ?? []) m.set(f.sessionId, f);
    return m;
  }, [facets]);

  const toggleSession = useMutation({
    mutationFn: (id: string) => client.favorites.toggleSession({ id }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orpc.favorites.get.queryOptions().queryKey,
      }),
  });

  const archiveSession = useMutation({
    mutationFn: (id: string) => client.sessions.archive({ sessionId: id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orpc.sessions.list.queryOptions({
          input: { slug: projectSlug },
        }).queryKey,
      });
      // Also refresh archived list so newly-archived session appears immediately
      void queryClient.invalidateQueries({
        queryKey: orpc.sessions.list.queryOptions({
          input: { slug: projectSlug, includeArchived: true },
        }).queryKey,
      });
    },
  });

  const handleFork = useCallback(
    (sessionId: string) => {
      const forkId = crypto.randomUUID();
      router.push(
        `/project/${projectSlug}/chat?_fork=1&parentSessionId=${sessionId}&forkSessionId=${forkId}`
      );
    },
    [router, projectSlug]
  );

  // --- Archived section ---
  const [showArchived, setShowArchived] = useState(false);

  const { data: archivedSessions, isLoading: archivedLoading } = useQuery({
    ...orpc.sessions.list.queryOptions({
      input: { slug: projectSlug, includeArchived: true },
    }),
    enabled: showArchived,
    refetchInterval: showArchived ? 30000 : false,
  });

  const unarchiveSession = useMutation({
    mutationFn: (id: string) =>
      client.sessions.archive({ sessionId: id, archived: false }),
    onSuccess: () => {
      // Remove from archived list
      void queryClient.invalidateQueries({
        queryKey: orpc.sessions.list.queryOptions({
          input: { slug: projectSlug, includeArchived: true },
        }).queryKey,
      });
      // Re-add to active list
      void queryClient.invalidateQueries({
        queryKey: orpc.sessions.list.queryOptions({
          input: { slug: projectSlug },
        }).queryKey,
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {(!sessions || sessions.length === 0) && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No sessions found
        </div>
      )}

      {sessions?.map((session) => {
        const f = facetMap.get(session.id);
        return (
          <SessionCard
            key={session.id}
            session={session}
            projectSlug={projectSlug}
            isFavorite={favorites?.sessions.includes(session.id)}
            onToggleFavorite={() => toggleSession.mutate(session.id)}
            onArchive={() => archiveSession.mutate(session.id)}
            onFork={handleFork}
            facet={f}
          />
        );
      })}

      {/* Archived section */}
      <div className="mt-2 border-t pt-3">
        <button
          onClick={() => setShowArchived((prev) => !prev)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2 px-1"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="20" height="5" x="2" y="3" rx="1" />
            <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
            <path d="M10 12h4" />
          </svg>
          {showArchived
            ? "Hide archived conversations"
            : "Show archived conversations"}
        </button>

        {showArchived && (
          <div className="flex flex-col gap-2">
            {archivedLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}

            {!archivedLoading && (archivedSessions ?? []).length === 0 && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No archived conversations
              </div>
            )}

            {(archivedSessions ?? []).map((session) => {
              const f = facetMap.get(session.id);
              return (
                <SessionCard
                  key={session.id}
                  session={session}
                  projectSlug={projectSlug}
                  isFavorite={favorites?.sessions.includes(session.id)}
                  onToggleFavorite={() => toggleSession.mutate(session.id)}
                  onArchive={() => unarchiveSession.mutate(session.id)}
                  onFork={handleFork}
                  facet={f}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
