"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type {
  ActivityItem,
  CommitRaw,
  CronEventRaw,
  DeploymentRaw,
  EmailEventRaw,
  TicketRaw,
  WebhookEventRaw,
} from "@/lib/activity-types";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ContextOption {
  id: string;
  label: string;
  description: string;
  defaultOn: boolean;
  buildSection: () => string;
}

interface ChatContextSheetProps {
  item: ActivityItem | null;
  slug: string;
  /** Related deployments — passed for commit items */
  relatedDeployments?: DeploymentRaw[];
  /** Related commit — passed for deployment items */
  relatedCommit?: CommitRaw;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

function buildOptions(
  item: ActivityItem,
  relatedDeployments?: DeploymentRaw[],
  relatedCommit?: CommitRaw
): ContextOption[] {
  switch (item.type) {
    case "commit": {
      const raw = item.raw as CommitRaw;
      const hasDeployments =
        relatedDeployments && relatedDeployments.length > 0;
      const hasFailed = relatedDeployments?.some(
        (d) => d.status === "FAILED" || d.status === "CRASHED"
      );

      const opts: ContextOption[] = [
        {
          id: "commit-details",
          label: "Commit details",
          description: `${raw.shortHash} by ${raw.author}`,
          defaultOn: true,
          buildSection: () => {
            const lines = [
              "[Commit]",
              `Hash: ${raw.shortHash} (${raw.hash})`,
              `Author: ${raw.author}`,
              `Date: ${raw.date}`,
            ];
            if (raw.branch) lines.push(`Branch: ${raw.branch}`);
            lines.push("", `Subject: ${raw.subject}`);
            if (raw.body?.trim()) lines.push("", "Body:", raw.body.trim());
            return lines.join("\n");
          },
        },
        {
          id: "commit-diff",
          label: "Diff / changes",
          description: `Run git show ${raw.shortHash} to inspect`,
          defaultOn: true,
          buildSection: () =>
            [
              "[Diff]",
              `Run \`git show ${raw.shortHash}\` to inspect the full diff of this commit.`,
            ].join("\n"),
        },
      ];

      if (hasDeployments) {
        opts.push({
          id: "deployment-status",
          label: "Deployment status",
          description: relatedDeployments!
            .map((d) => `${d.serviceName}: ${d.status}`)
            .join(", "),
          defaultOn: true,
          buildSection: () => {
            const lines = ["[Deployments]"];
            for (const d of relatedDeployments!) {
              lines.push(`Service: ${d.serviceName}`);
              lines.push(`Status: ${d.status}`);
              if (d.dashboardUrl) lines.push(`Dashboard: ${d.dashboardUrl}`);
              if (d.serviceUrl) lines.push(`Live URL: ${d.serviceUrl}`);
            }
            return lines.join("\n");
          },
        });
      }

      if (hasFailed) {
        opts.push({
          id: "failure-investigation",
          label: "Investigate failure",
          description: "Ask the agent to diagnose the failed deployment",
          defaultOn: true,
          buildSection: () =>
            [
              "[Task]",
              "One or more deployments triggered by this commit have failed.",
              "Please investigate the root cause, check logs, and suggest a fix.",
            ].join("\n"),
        });
      }

      return opts;
    }

    case "deployment": {
      const raw = item.raw as DeploymentRaw;
      const isFailed = raw.status === "FAILED" || raw.status === "CRASHED";

      const opts: ContextOption[] = [
        {
          id: "deploy-info",
          label: "Deployment info",
          description: `${raw.serviceName} · ${raw.status}`,
          defaultOn: true,
          buildSection: () => {
            const lines = [
              "[Deployment]",
              `Service: ${raw.serviceName}`,
              `Status: ${raw.status}`,
              `ID: ${raw.id}`,
              `Created: ${raw.createdAt}`,
            ];
            if (raw.dashboardUrl) lines.push(`Dashboard: ${raw.dashboardUrl}`);
            if (raw.serviceUrl) lines.push(`Live URL: ${raw.serviceUrl}`);
            return lines.join("\n");
          },
        },
      ];

      if (raw.commitHash || relatedCommit) {
        opts.push({
          id: "deploy-commit",
          label: "Triggering commit",
          description: relatedCommit
            ? relatedCommit.subject
            : (raw.commitMessage ?? raw.commitHash?.slice(0, 7) ?? ""),
          defaultOn: true,
          buildSection: () => {
            const lines = ["[Commit]"];
            if (relatedCommit) {
              lines.push(
                `Hash: ${relatedCommit.shortHash} (${relatedCommit.hash})`,
                `Author: ${relatedCommit.author}`,
                `Subject: ${relatedCommit.subject}`
              );
              if (relatedCommit.body?.trim())
                lines.push("", "Body:", relatedCommit.body.trim());
            } else if (raw.commitHash) {
              lines.push(
                `Hash: ${raw.commitHash.slice(0, 7)}`,
                ...(raw.commitMessage ? [`Message: ${raw.commitMessage}`] : [])
              );
            }
            return lines.join("\n");
          },
        });
      }

      if (isFailed) {
        opts.push({
          id: "failure-investigation",
          label: "Investigate failure",
          description: "Ask the agent to diagnose the root cause",
          defaultOn: true,
          buildSection: () =>
            [
              "[Task]",
              "This deployment has failed. Please:",
              "- Investigate why this deployment failed",
              "- Check Railway logs for error messages",
              "- Identify and fix the root cause",
              "- Suggest a fix and how to redeploy",
            ].join("\n"),
        });
      }

      return opts;
    }

    case "ticket": {
      const raw = item.raw as TicketRaw;
      return [
        {
          id: "ticket-details",
          label: "Issue details",
          description: `${raw.identifier} — ${raw.title}`,
          defaultOn: true,
          buildSection: () => {
            const lines = [
              "[Linear Issue]",
              `Issue: ${raw.identifier} — ${raw.title}`,
              `Status: ${raw.status}`,
            ];
            if (raw.priority !== undefined)
              lines.push(
                `Priority: ${PRIORITY_LABEL[raw.priority] ?? raw.priority}`
              );
            if (raw.assignee) lines.push(`Assignee: ${raw.assignee}`);
            lines.push(`URL: ${raw.url}`);
            return lines.join("\n");
          },
        },
        {
          id: "ticket-description",
          label: "Issue description",
          description: raw.description
            ? raw.description.slice(0, 60) + "\u2026"
            : "No description",
          defaultOn: !!raw.description?.trim(),
          buildSection: () => {
            if (!raw.description?.trim()) return "";
            return ["[Description]", raw.description.trim()].join("\n");
          },
        },
        {
          id: "ticket-task",
          label: "Implementation task",
          description: "Ask the agent to start implementing this issue",
          defaultOn: true,
          buildSection: () =>
            [
              "[Task]",
              "Please help me work on this issue. You can:",
              "- Start implementing the feature or fix",
              "- Break it down into smaller subtasks",
              "- Write a technical plan or approach",
              "- Create tests for the requirements",
            ].join("\n"),
        },
      ];
    }

    case "email": {
      const raw = item.raw as EmailEventRaw;
      return [
        {
          id: "email-details",
          label: "Email details",
          description: `${raw.direction} · ${raw.subject ?? "(no subject)"}`,
          defaultOn: true,
          buildSection: () =>
            [
              "[Email]",
              `Direction: ${raw.direction}`,
              `From: ${raw.from}`,
              `To: ${raw.to}`,
              ...(raw.subject ? [`Subject: ${raw.subject}`] : []),
              `Status: ${raw.status}`,
              `Time: ${raw.timestamp}`,
            ].join("\n"),
        },
        {
          id: "email-task",
          label: "Action request",
          description: "Ask the agent what to do with this email",
          defaultOn: true,
          buildSection: () =>
            [
              "[Task]",
              "I can help you with this email. For example:",
              "- Draft a reply",
              "- Summarise the conversation",
              "- Take action based on the email content",
              "- Check if any follow-up is needed",
            ].join("\n"),
        },
      ];
    }

    case "webhook": {
      const raw = item.raw as WebhookEventRaw;
      return [
        {
          id: "webhook-details",
          label: "Webhook event",
          description: `${raw.provider} · ${raw.eventType}`,
          defaultOn: true,
          buildSection: () =>
            [
              "[Webhook Event]",
              `Provider: ${raw.provider}`,
              `Event: ${raw.eventType}${raw.action ? ` · ${raw.action}` : ""}`,
              `Status: ${raw.status}`,
              `Time: ${raw.timestamp}`,
            ].join("\n"),
        },
        {
          id: "webhook-payload",
          label: "Payload summary",
          description: raw.payloadSummary
            ? raw.payloadSummary.slice(0, 60) + "\u2026"
            : "No payload summary",
          defaultOn: !!raw.payloadSummary,
          buildSection: () => {
            if (!raw.payloadSummary) return "";
            return ["[Payload Summary]", raw.payloadSummary].join("\n");
          },
        },
        {
          id: "webhook-task",
          label: "Investigation task",
          description: "Ask the agent to analyse and act on this event",
          defaultOn: true,
          buildSection: () =>
            [
              "[Task]",
              "Please help me with this webhook event. You can:",
              "- Explain what triggered it and what it means",
              "- Take action in response to this event",
              "- Debug why this event may have failed",
              "- Review the related code or configuration",
            ].join("\n"),
        },
      ];
    }

    case "cron": {
      const raw = item.raw as CronEventRaw;
      const isFailed = raw.status === "error";
      return [
        {
          id: "cron-details",
          label: "Cron execution",
          description: `Schedule: ${raw.expression} · ${raw.status}`,
          defaultOn: true,
          buildSection: () =>
            [
              "[Cron Execution]",
              `Schedule: ${raw.expression}`,
              `Status: ${raw.status}`,
              `Time: ${raw.timestamp}`,
              "",
              "Prompt that was executed:",
              raw.prompt,
            ].join("\n"),
        },
        ...(raw.error
          ? [
              {
                id: "cron-error",
                label: "Error output",
                description: raw.error.slice(0, 60) + "\u2026",
                defaultOn: isFailed,
                buildSection: () => ["[Error]", raw.error].join("\n"),
              } as ContextOption,
            ]
          : []),
        {
          id: "cron-task",
          label: isFailed ? "Fix this failure" : "Review execution",
          description: isFailed
            ? "Ask the agent to investigate and fix the issue"
            : "Ask the agent to review what happened",
          defaultOn: true,
          buildSection: () =>
            isFailed
              ? [
                  "[Task]",
                  "This cron execution failed. Please:",
                  "- Investigate what went wrong",
                  "- Fix the prompt or underlying issue",
                  "- Suggest how to re-run the task to test the fix",
                ].join("\n")
              : [
                  "[Task]",
                  "Please review this cron execution. You can:",
                  "- Summarise what the agent did during this run",
                  "- Adjust the prompt for future executions",
                  "- Check the output or side effects of this run",
                ].join("\n"),
        },
      ];
    }

    default:
      return [];
  }
}

function buildPrompt(options: ContextOption[], selected: Set<string>): string {
  const sections = options
    .filter((o) => selected.has(o.id))
    .map((o) => o.buildSection())
    .filter(Boolean);

  if (sections.length === 0) return "";

  return sections.join("\n\n") + "\n\n---\n\nWhat would you like to do?";
}

// ─────────────────────────────────────────────────────────────────────────────
// Item header info
// ─────────────────────────────────────────────────────────────────────────────

function itemTitle(item: ActivityItem): string {
  switch (item.type) {
    case "commit":
      return (item.raw as CommitRaw).subject;
    case "deployment": {
      const raw = item.raw as DeploymentRaw;
      return `${raw.serviceName} \u2014 ${raw.status}`;
    }
    case "ticket": {
      const raw = item.raw as TicketRaw;
      return `${raw.identifier}: ${raw.title}`;
    }
    case "email":
      return (item.raw as EmailEventRaw).subject ?? "(no subject)";
    case "webhook": {
      const raw = item.raw as WebhookEventRaw;
      return `${raw.provider} · ${raw.eventType}`;
    }
    case "cron":
      return `Cron · ${(item.raw as CronEventRaw).expression}`;
    default:
      return "Activity item";
  }
}

function itemTypeLabel(type: string): string {
  switch (type) {
    case "commit":
      return "Commit";
    case "deployment":
      return "Deployment";
    case "ticket":
      return "Issue";
    case "email":
      return "Email";
    case "webhook":
      return "Webhook";
    case "cron":
      return "Cron";
    default:
      return "Item";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ChatContextSheet({
  item,
  slug,
  relatedDeployments,
  relatedCommit,
  onClose,
}: ChatContextSheetProps) {
  const router = useRouter();
  const open = item !== null;

  // Compute options whenever the item changes
  const options = item
    ? buildOptions(item, relatedDeployments, relatedCommit)
    : [];

  // Selected set — reset to defaults when item changes
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!item) return;
    const defaults = new Set(
      buildOptions(item, relatedDeployments, relatedCommit)
        .filter((o) => o.defaultOn)
        .map((o) => o.id)
    );
    setSelected(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleStartChat() {
    if (!item) return;
    const prompt = buildPrompt(options, selected);
    if (!prompt) return;
    router.push(`/project/${slug}/chat?prompt=${encodeURIComponent(prompt)}`);
    onClose();
  }

  const isFailed =
    item?.type === "deployment" &&
    ["FAILED", "CRASHED"].includes((item.raw as DeploymentRaw).status);

  const isCommitWithFailure =
    item?.type === "commit" &&
    relatedDeployments?.some(
      (d) => d.status === "FAILED" || d.status === "CRASHED"
    );

  const showDanger = isFailed || isCommitWithFailure;

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <SheetContent side="right" className="flex flex-col sm:max-w-sm w-full">
        <SheetHeader className="pb-3 border-b">
          <div className="flex items-center gap-2 pr-8">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide shrink-0">
              {itemTypeLabel(item?.type ?? "")}
            </span>
          </div>
          <SheetTitle className="text-sm font-medium leading-snug line-clamp-2 pr-6">
            {item ? itemTitle(item) : ""}
          </SheetTitle>
        </SheetHeader>

        {/* Options */}
        <div className="flex-1 overflow-y-auto py-3 flex flex-col gap-2 px-4">
          <p className="text-[11px] text-muted-foreground mb-1">
            Choose what context to send to the agent:
          </p>

          {options.map((opt) => {
            const isSelected = selected.has(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggle(opt.id)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors w-full",
                  isSelected
                    ? "border-primary/60 bg-primary/8"
                    : "border-border/60 hover:border-primary/30 hover:bg-muted/40"
                )}
              >
                {/* Checkbox indicator */}
                <span
                  className={cn(
                    "mt-0.5 shrink-0 flex h-4 w-4 items-center justify-center rounded border transition-colors",
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-border/60"
                  )}
                >
                  {isSelected && (
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="2 6 5 9 10 3" />
                    </svg>
                  )}
                </span>

                {/* Label + description */}
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-xs font-medium leading-tight",
                      isSelected ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {opt.label}
                  </p>
                  {opt.description && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground/70 truncate">
                      {opt.description}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t px-4 pt-3 pb-4 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-xs"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className={cn(
              "flex-1 text-xs",
              showDanger && "bg-red-500 hover:bg-red-600 text-white"
            )}
            disabled={selected.size === 0}
            onClick={handleStartChat}
          >
            {showDanger ? "\u2726 Fix deployment" : "\u2726 Start chat"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
