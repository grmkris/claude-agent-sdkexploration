"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";

export default function RootPage() {
  const queryClient = useQueryClient();

  const { data: primary } = useQuery(orpc.root.primarySession.queryOptions());
  const { data: sessions, isLoading } = useQuery({
    ...orpc.root.sessions.queryOptions({ input: {} }),
    refetchInterval: 15000,
  });

  const setPrimary = useMutation({
    mutationFn: (sessionId: string | null) =>
      client.root.setPrimary({ sessionId }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: orpc.root.primarySession.queryOptions().queryKey,
      }),
  });

  const primarySessionId = primary?.sessionId;
  const primarySession = sessions?.find((s) => s.id === primarySessionId);
  const otherSessions =
    sessions?.filter((s) => s.id !== primarySessionId) ?? [];

  return (
    <div className="flex-1 overflow-auto p-4">
      <h2 className="mb-4 text-sm font-medium">Root Workspace</h2>

      {/* Primary session card */}
      <div className="mb-6 rounded border p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Primary Session
          </span>
          {primarySession?.sessionState === "active" && (
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
          )}
        </div>

        {primarySession ? (
          <div className="flex flex-col gap-2">
            <p className="truncate text-sm">{primarySession.firstPrompt}</p>
            <p className="text-[10px] text-muted-foreground">
              Last modified:{" "}
              {new Date(primarySession.lastModified).toLocaleString()}
            </p>
            <div className="flex gap-2">
              <Link href={`/root/chat/${primarySession.id}`}>
                <Button size="sm">Continue</Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPrimary.mutate(null)}
              >
                Unpin
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              No primary session set. Start one or pin an existing session.
            </p>
            <Link href="/root/chat">
              <Button size="sm">Start Primary Session</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Session list */}
      <div>
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">
          Sessions
        </h3>
        {isLoading && (
          <div className="py-4 text-center text-xs text-muted-foreground animate-pulse">
            Loading...
          </div>
        )}
        {!isLoading && sessions?.length === 0 && (
          <div className="py-4 text-center text-xs text-muted-foreground">
            No sessions yet
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          {otherSessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center gap-2 rounded border px-3 py-2"
            >
              {session.sessionState === "active" && (
                <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-green-500" />
              )}
              <Link
                href={`/root/chat/${session.id}`}
                className="min-w-0 flex-1 truncate text-xs hover:underline"
              >
                {session.firstPrompt}
              </Link>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {new Date(session.lastModified).toLocaleDateString()}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px]"
                onClick={() => setPrimary.mutate(session.id)}
              >
                Pin
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
