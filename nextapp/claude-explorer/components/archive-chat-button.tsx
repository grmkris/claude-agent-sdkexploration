"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { orpc } from "@/lib/orpc";

export function ArchiveChatButton() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Extract session ID and optional project slug from URL.
  // Matches /project/:slug/chat/:sessionId  OR  /chat/:sessionId
  // Does NOT match new-chat pages (/chat or /project/:slug/chat) because those
  // lack the trailing session ID segment.
  const projectChatMatch = pathname.match(/\/project\/([^/]+)\/chat\/([^/]+)$/);
  const rootChatMatch = pathname.match(/^\/chat\/([^/]+)$/);

  const sessionId = projectChatMatch?.[2] ?? rootChatMatch?.[1];
  const projectSlug = projectChatMatch?.[1] ?? null;

  // Query the live session row to know whether it's already archived
  const { data: sessionData } = useQuery({
    ...orpc.liveState.session.queryOptions({
      input: { sessionId: sessionId ?? "" },
    }),
    enabled: !!sessionId,
  });

  const isArchived = sessionData?.is_archived === 1;

  const archiveMutation = useMutation({
    mutationFn: (archived: boolean) =>
      // Use client directly to avoid any mutationOptions typing issues
      import("@/lib/orpc-client").then(({ client }) =>
        client.sessions.archive({ sessionId: sessionId!, archived })
      ),
    onSuccess: (_data, archived) => {
      void queryClient.invalidateQueries();
      if (archived) {
        // Navigating away after archiving
        router.push(projectSlug ? `/project/${projectSlug}` : "/");
      }
      // If unarchiving, just stay on the page — the button will update to show the archive state
    },
  });

  // Only render on existing session pages (not new-chat pages)
  if (!sessionId) return null;

  const label = isArchived ? "Unarchive conversation" : "Archive conversation";

  return (
    <Tooltip>
      <TooltipTrigger
        render={(props) => (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            disabled={archiveMutation.isPending}
            {...props}
            onClick={(e) => {
              // Merge Radix's own onClick (if any) with our handler
              (props as React.HTMLAttributes<HTMLButtonElement>).onClick?.(e);
              archiveMutation.mutate(!isArchived);
            }}
          >
            <ArchiveIcon
              className="h-4 w-4"
              // Filled style when already archived so user can see the state
              fill={isArchived ? "currentColor" : "none"}
            />
            <span className="sr-only">{label}</span>
          </Button>
        )}
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
