"use client";

import type { z } from "zod";

import { useQuery } from "@tanstack/react-query";

import type { EmailEventSchema } from "@/lib/schemas";

import { Badge } from "@/components/ui/badge";
import { orpc } from "@/lib/orpc";
import { getTimeAgo } from "@/lib/utils";

type EmailEvent = z.infer<typeof EmailEventSchema>;

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "avif",
  "bmp",
]);

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function AttachmentChip({
  eventId,
  filename,
  size,
}: {
  eventId: string;
  filename: string;
  size: number;
}) {
  const href = `/api/email-files?eventId=${encodeURIComponent(eventId)}&filename=${encodeURIComponent(filename)}`;
  const ext = getExtension(filename);
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const sizeKb = size > 0 ? `${Math.round(size / 1024)}KB` : null;

  return (
    <div className="flex flex-col gap-1">
      {isImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={href}
          alt={filename}
          className="max-h-40 max-w-full rounded border object-contain"
        />
      )}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] hover:bg-muted transition-colors w-fit"
      >
        <span className="truncate max-w-[160px]">{filename}</span>
        {sizeKb && (
          <span className="shrink-0 text-muted-foreground">{sizeKb}</span>
        )}
      </a>
    </div>
  );
}

function EmailMessage({ event }: { event: EmailEvent }) {
  // Fetch disk content when body or attachment list isn't already stored on the event
  const needsDiskFetch =
    !event.body ||
    (event.direction === "inbound" && !event.attachmentFilenames);
  const { data: detail, isLoading } = useQuery({
    ...orpc.email.getContent.queryOptions({ input: { eventId: event.id } }),
    enabled: needsDiskFetch,
  });

  const body = event.body ?? detail?.body ?? null;
  // Use stored filenames when available, fall back to disk listing from detail
  const attachments: Array<{ filename: string; size: number }> =
    event.attachmentFilenames?.map((f) => ({ filename: f, size: 0 })) ??
    detail?.attachments ??
    [];
  const isInbound = event.direction === "inbound";

  return (
    <div
      className={[
        "rounded border p-3 flex flex-col gap-2",
        isInbound
          ? "bg-muted/30 border-border"
          : "bg-blue-500/5 border-blue-500/20 ml-4",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant="outline"
              className={[
                "shrink-0 px-1.5 py-0 text-[9px] font-medium",
                isInbound
                  ? "border-blue-400/50 text-blue-600 dark:text-blue-400"
                  : "border-green-400/50 text-green-600 dark:text-green-400",
              ].join(" ")}
            >
              {isInbound ? "↓ received" : "↑ sent"}
            </Badge>
            <span className="text-xs font-medium truncate">{event.from}</span>
          </div>
          <span className="text-[10px] text-muted-foreground truncate">
            To: {event.to}
          </span>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {getTimeAgo(event.timestamp)}
        </span>
      </div>

      {/* Body */}
      <div className="border-t pt-2">
        {body ? (
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">
            {body}
          </pre>
        ) : isLoading && needsDiskFetch ? (
          <p className="text-xs text-muted-foreground animate-pulse">
            Loading…
          </p>
        ) : event.status === "running" ? (
          <p className="text-xs text-muted-foreground animate-pulse">
            Processing email…
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Body unavailable
          </p>
        )}
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="border-t pt-2 flex flex-col gap-1.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Attachments
          </span>
          <div className="flex flex-wrap gap-2">
            {attachments.map((att) => (
              <AttachmentChip
                key={att.filename}
                eventId={event.id}
                filename={att.filename}
                size={att.size}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface EmailThreadViewProps {
  events: EmailEvent[];
}

export function EmailThreadView({ events }: EmailThreadViewProps) {
  const sorted = [...events].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp)
  );

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
        No email messages in this thread.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {sorted.map((event) => (
        <EmailMessage key={event.id} event={event} />
      ))}
    </div>
  );
}
