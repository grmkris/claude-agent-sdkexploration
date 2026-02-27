"use client";

import type { z } from "zod";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { EmailEventSchema } from "@/lib/schemas";

import { ChatView } from "@/components/chat-view";
import { EmailThreadView } from "@/components/email-thread-view";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { orpc } from "@/lib/orpc";

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
  const [agentSessionOpen, setAgentSessionOpen] = useState(false);

  const isRoot = projectSlug === "__root__" || projectSlug === "__outbound__";

  const { data: projectMessages, isLoading: isLoadingProject } = useQuery({
    ...orpc.sessions.messages.queryOptions({
      input: { slug: projectSlug ?? "", sessionId: sessionId ?? "" },
    }),
    enabled: open && !!sessionId && !isRoot && agentSessionOpen,
  });

  const { data: rootMessages, isLoading: isLoadingRoot } = useQuery({
    ...orpc.root.messages.queryOptions({
      input: { sessionId: sessionId ?? "" },
    }),
    enabled: open && !!sessionId && isRoot && agentSessionOpen,
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

        {/* Email thread — scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <EmailThreadView events={sortedRelated} />
        </div>

        {/* Agent session — collapsed by default */}
        {sessionId && (
          <Collapsible
            open={agentSessionOpen}
            onOpenChange={setAgentSessionOpen}
            className="shrink-0 border-t"
          >
            <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              {agentSessionOpen ? (
                <ChevronDown className="size-3.5 shrink-0" />
              ) : (
                <ChevronRight className="size-3.5 shrink-0" />
              )}
              Agent Session
              <span className="ml-auto font-mono text-[9px] opacity-60">
                {sessionId.slice(0, 8)}&hellip;
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="max-h-[50vh] overflow-y-auto border-t">
              {isLoading ? (
                <div className="flex items-center justify-center p-6 text-sm text-muted-foreground animate-pulse">
                  Loading conversation&hellip;
                </div>
              ) : messages && messages.length > 0 ? (
                <ChatView
                  messages={messages}
                  projectSlug={isRoot ? undefined : projectSlug}
                  sessionId={sessionId}
                />
              ) : (
                <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
                  No messages found for this session.
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
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
