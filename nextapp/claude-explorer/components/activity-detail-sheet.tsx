"use client";

import Link from "next/link";

import type {
  ActivityItem,
  CronEventRaw,
  EmailEventRaw,
  WebhookEventRaw,
} from "@/lib/activity-types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface ActivityDetailSheetProps {
  item: ActivityItem | null;
  slug: string;
  onClose: () => void;
}

export function ActivityDetailSheet({
  item,
  slug,
  onClose,
}: ActivityDetailSheetProps) {
  const open = item !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <SheetContent side="right" className="flex flex-col sm:max-w-xl w-full">
        {item?.type === "email" && (
          <EmailDetail
            raw={item.raw as EmailEventRaw}
            slug={slug}
            onClose={onClose}
          />
        )}
        {item?.type === "webhook" && (
          <WebhookDetail
            raw={item.raw as WebhookEventRaw}
            slug={slug}
            onClose={onClose}
          />
        )}
        {item?.type === "cron" && (
          <CronDetail
            raw={item.raw as CronEventRaw}
            slug={slug}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Email detail
// ─────────────────────────────────────────────────────────────────────────────

function EmailDetail({
  raw,
  slug,
  onClose,
}: {
  raw: EmailEventRaw;
  slug: string;
  onClose: () => void;
}) {
  const isRoot =
    raw.projectSlug === "__root__" || raw.projectSlug === "__outbound__";
  const sessionHref = raw.sessionId
    ? isRoot
      ? `/chat/${raw.sessionId}`
      : `/project/${slug}/chat/${raw.sessionId}`
    : null;

  return (
    <>
      <SheetHeader className="shrink-0 border-b pb-3">
        <SheetTitle>{raw.subject ?? "Email"}</SheetTitle>
        <SheetDescription className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0",
              raw.direction === "inbound"
                ? "border-indigo-500/30 text-indigo-400"
                : "border-emerald-500/30 text-emerald-400"
            )}
          >
            {raw.direction}
          </Badge>
          <StatusBadge status={raw.status} />
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <Field label="From" value={raw.from} mono />
        <Field label="To" value={raw.to} mono />
        {raw.subject && <Field label="Subject" value={raw.subject} />}
        <Field label="Time" value={new Date(raw.timestamp).toLocaleString()} />
        {raw.sessionId && (
          <Field label="Session" value={raw.sessionId} mono truncate />
        )}
      </div>

      {sessionHref && (
        <div className="shrink-0 border-t p-3 flex justify-end">
          <Link href={sessionHref} onClick={onClose}>
            <Button variant="outline" size="sm">
              Open session &rarr;
            </Button>
          </Link>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook detail
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  github: "border-neutral-500/30 text-neutral-400",
  linear: "border-violet-500/30 text-violet-400",
  railway: "border-purple-500/30 text-purple-400",
  generic: "border-orange-500/30 text-orange-400",
};

function WebhookDetail({
  raw,
  slug,
  onClose,
}: {
  raw: WebhookEventRaw;
  slug: string;
  onClose: () => void;
}) {
  const sessionHref = raw.sessionId
    ? `/project/${slug}/chat/${raw.sessionId}`
    : null;

  return (
    <>
      <SheetHeader className="shrink-0 border-b pb-3">
        <SheetTitle>
          {raw.eventType}
          {raw.action && (
            <span className="text-muted-foreground font-normal">
              {" "}
              · {raw.action}
            </span>
          )}
        </SheetTitle>
        <SheetDescription className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0 capitalize",
              PROVIDER_COLORS[raw.provider] ??
                "border-orange-500/30 text-orange-400"
            )}
          >
            {raw.provider}
          </Badge>
          <StatusBadge status={raw.status} />
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <Field label="Provider" value={raw.provider} />
        <Field label="Event" value={raw.eventType} />
        {raw.action && <Field label="Action" value={raw.action} />}
        <Field label="Time" value={new Date(raw.timestamp).toLocaleString()} />
        {raw.payloadSummary && (
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Payload Summary
            </p>
            <p className="text-xs text-foreground whitespace-pre-wrap break-words rounded border border-border/50 bg-muted/30 px-2 py-1.5">
              {raw.payloadSummary}
            </p>
          </div>
        )}
        {raw.sessionId && (
          <Field label="Session" value={raw.sessionId} mono truncate />
        )}
      </div>

      {sessionHref && (
        <div className="shrink-0 border-t p-3 flex justify-end">
          <Link href={sessionHref} onClick={onClose}>
            <Button variant="outline" size="sm">
              Open session &rarr;
            </Button>
          </Link>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron detail
// ─────────────────────────────────────────────────────────────────────────────

function CronDetail({
  raw,
  slug,
  onClose,
}: {
  raw: CronEventRaw;
  slug: string;
  onClose: () => void;
}) {
  const sessionHref = raw.sessionId
    ? `/project/${slug}/chat/${raw.sessionId}`
    : null;

  return (
    <>
      <SheetHeader className="shrink-0 border-b pb-3">
        <SheetTitle>Cron Execution</SheetTitle>
        <SheetDescription className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded text-foreground">
            {raw.expression}
          </span>
          <StatusBadge status={raw.status} />
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <Field label="Expression" value={raw.expression} mono />
        <Field label="Time" value={new Date(raw.timestamp).toLocaleString()} />
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Prompt
          </p>
          <p className="text-xs text-foreground whitespace-pre-wrap break-words rounded border border-border/50 bg-muted/30 px-2 py-1.5">
            {raw.prompt}
          </p>
        </div>
        {raw.error && (
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-red-400 uppercase tracking-wide">
              Error
            </p>
            <p className="text-xs text-red-300 whitespace-pre-wrap break-words rounded border border-red-500/20 bg-red-500/5 px-2 py-1.5">
              {raw.error}
            </p>
          </div>
        )}
        {raw.sessionId && (
          <Field label="Session" value={raw.sessionId} mono truncate />
        )}
      </div>

      {sessionHref && (
        <div className="shrink-0 border-t p-3 flex justify-end">
          <Link href={sessionHref} onClick={onClose}>
            <Button variant="outline" size="sm">
              Open session &rarr;
            </Button>
          </Link>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "success" | "error" | "running" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] px-1.5 py-0 inline-flex items-center gap-1",
        status === "error" && "border-red-500/30 text-red-400",
        status === "running" && "border-yellow-500/30 text-yellow-400",
        status === "success" && "border-green-500/30 text-green-400"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-current",
          status === "running" && "animate-pulse"
        )}
      />
      {status}
    </Badge>
  );
}

function Field({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p
        className={cn(
          "text-xs text-foreground",
          mono && "font-mono",
          truncate && "truncate"
        )}
      >
        {value}
      </p>
    </div>
  );
}
