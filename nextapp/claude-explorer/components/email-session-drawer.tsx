"use client";

import type { z } from "zod";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import type { EmailEventSchema } from "@/lib/schemas";

import { ChatView } from "@/components/chat-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { orpc } from "@/lib/orpc";
import { getTimeAgo } from "@/lib/utils";

type EmailEvent = z.infer<typeof EmailEventSchema>;

interface EmailSessionDrawerProps {
  event: EmailEvent | null;
  relatedEvents: EmailEvent[];
  onClose: () => void;
}

export function EmailSessionDrawer({
  event,
  relatedEvents,
  onClose,
}: EmailSessionDrawerProps) {
  const open = event !== null;
  const sessionId = event?.sessionId;
  const projectSlug = event?.projectSlug;

  const isRoot = projectSlug === "__root__" || projectSlug === "__outbound__";

  const { data: projectMessages, isLoading: isLoadingProject } = useQuery({
    ...orpc.sessions.messages.queryOptions({
      input: { slug: projectSlug ?? "", sessionId: sessionId ?? "" },
    }),
    enabled: open && !!sessionId && !isRoot,
  });

  const { data: rootMessages, isLoading: isLoadingRoot } = useQuery({
    ...orpc.root.messages.queryOptions({
      input: { sessionId: sessionId ?? "" },
    }),
    enabled: open && !!sessionId && isRoot,
  });

  const messages = isRoot ? rootMessages : projectMessages;
  const isLoading = isRoot ? isLoadingRoot : isLoadingProject;

  const fullSessionHref = sessionId
    ? isRoot
      ? `/chat/${sessionId}`
      : `/project/${projectSlug}/chat/${sessionId}`
    : null;

  const sortedRelated = [...relatedEvents].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp)
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <SheetContent side="right" className="flex flex-col sm:max-w-2xl w-full">
        <SheetHeader className="shrink-0 border-b pb-3">
          <SheetTitle>
            {event?.subject ? event.subject : "Email Conversation"}
          </SheetTitle>
          {sessionId && (
            <SheetDescription>
              Session {sessionId.slice(0, 8)}&hellip;
            </SheetDescription>
          )}
        </SheetHeader>

        {/* Related events in this session — only show when there are 2+ */}
        {sortedRelated.length > 1 && (
          <div className="shrink-0 border-b px-4 py-2">
            <p className="mb-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Email thread &middot; {sortedRelated.length} events
            </p>
            <div className="flex flex-col gap-1">
              {sortedRelated.map((ev) => (
                <div
                  key={ev.id}
                  className={`flex items-center gap-2 text-[10px] ${ev.id === event?.id ? "opacity-100" : "opacity-60"}`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${ev.direction === "inbound" ? "bg-blue-500" : "bg-green-500"}`}
                  />
                  <Badge
                    variant="outline"
                    className="shrink-0 px-1 py-0 text-[9px]"
                  >
                    {ev.direction}
                  </Badge>
                  <span className="text-muted-foreground truncate">
                    {ev.from} &rarr; {ev.to}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {getTimeAgo(ev.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conversation body */}
        {!sessionId ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No session linked to this email event.
          </div>
        ) : isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground animate-pulse">
            Loading conversation&hellip;
          </div>
        ) : messages && messages.length > 0 ? (
          <ChatView
            messages={messages}
            projectSlug={isRoot ? undefined : projectSlug}
            sessionId={sessionId}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No messages found for this session.
          </div>
        )}

        {/* Footer */}
        {fullSessionHref && (
          <div className="shrink-0 border-t p-3 flex justify-end">
            <Link href={fullSessionHref} onClick={onClose}>
              <Button variant="outline" size="sm">
                Open full session &rarr;
              </Button>
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
