"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
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

  const archiveMutation = useMutation({
    ...orpc.sessions.archive.mutationOptions(),
    onSuccess: () => {
      // Invalidate all session-related queries so lists update immediately
      void queryClient.invalidateQueries();
      // Navigate away from the now-archived conversation
      router.push(projectSlug ? `/project/${projectSlug}` : "/");
    },
  });

  // Only render on existing session pages (not new-chat pages)
  if (!sessionId) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={(props) => (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => archiveMutation.mutate({ sessionId })}
            disabled={archiveMutation.isPending}
            {...props}
          >
            <ArchiveIcon className="h-4 w-4" />
            <span className="sr-only">Archive conversation</span>
          </Button>
        )}
      />
      <TooltipContent>Archive conversation</TooltipContent>
    </Tooltip>
  );
}
