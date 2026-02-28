import type { IconSvgElement } from "@hugeicons/react";

import {
  Attachment01Icon,
  GitBranchIcon,
  Mail01Icon,
  MessageMultiple02Icon,
  Rocket01Icon,
  Ticket02Icon,
  TimeScheduleIcon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";

import type {
  CommitRaw,
  CronEventRaw,
  DeploymentRaw,
  EmailEventRaw,
  TicketRaw,
  WebhookEventRaw,
} from "./activity-types";

import {
  buildCommitContextPrompt,
  buildCronContextPrompt,
  buildDeploymentContextPrompt,
  buildEmailContextPrompt,
  buildTicketContextPrompt,
  buildWebhookContextPrompt,
} from "./activity-context";

// ─────────────────────────────────────────────────────────────────────────────
// Chip type definitions
// ─────────────────────────────────────────────────────────────────────────────

export type ContextChipType =
  | "file"
  | "commit"
  | "deployment"
  | "ticket"
  | "session"
  | "github-pr"
  | "email"
  | "webhook"
  | "cron";

interface BaseChip {
  id: string;
  type: ContextChipType;
  label: string;
  subtitle?: string;
}

export interface FileChip extends BaseChip {
  type: "file";
  filePath: string;
}

export interface CommitChip extends BaseChip {
  type: "commit";
  raw: CommitRaw;
}

export interface DeploymentChip extends BaseChip {
  type: "deployment";
  raw: DeploymentRaw;
}

export interface TicketChip extends BaseChip {
  type: "ticket";
  raw: TicketRaw;
}

export interface SessionChip extends BaseChip {
  type: "session";
  sessionId: string;
  firstPrompt: string;
}

export interface GitHubPRChip extends BaseChip {
  type: "github-pr";
  prNumber: string;
  title: string;
  url: string;
}

export interface EmailChip extends BaseChip {
  type: "email";
  raw: EmailEventRaw;
}

export interface WebhookChip extends BaseChip {
  type: "webhook";
  raw: WebhookEventRaw;
}

export interface CronChip extends BaseChip {
  type: "cron";
  raw: CronEventRaw;
}

export type ContextChip =
  | FileChip
  | CommitChip
  | DeploymentChip
  | TicketChip
  | SessionChip
  | GitHubPRChip
  | EmailChip
  | WebhookChip
  | CronChip;

// ─────────────────────────────────────────────────────────────────────────────
// Chip visuals — icon + color per type
// ─────────────────────────────────────────────────────────────────────────────

interface ChipVisuals {
  icon: IconSvgElement;
  colorClass: string;
  borderClass: string;
}

const CHIP_VISUALS: Record<ContextChipType, ChipVisuals> = {
  file: {
    icon: Attachment01Icon,
    colorClass: "text-blue-500",
    borderClass: "border-l-blue-400",
  },
  commit: {
    icon: GitBranchIcon,
    colorClass: "text-green-500",
    borderClass: "border-l-green-400",
  },
  deployment: {
    icon: Rocket01Icon,
    colorClass: "text-orange-500",
    borderClass: "border-l-orange-400",
  },
  ticket: {
    icon: Ticket02Icon,
    colorClass: "text-purple-500",
    borderClass: "border-l-purple-400",
  },
  session: {
    icon: MessageMultiple02Icon,
    colorClass: "text-muted-foreground",
    borderClass: "border-l-border",
  },
  "github-pr": {
    icon: GitBranchIcon,
    colorClass: "text-teal-500",
    borderClass: "border-l-teal-400",
  },
  email: {
    icon: Mail01Icon,
    colorClass: "text-yellow-500",
    borderClass: "border-l-yellow-400",
  },
  webhook: {
    icon: WebhookIcon,
    colorClass: "text-pink-500",
    borderClass: "border-l-pink-400",
  },
  cron: {
    icon: TimeScheduleIcon,
    colorClass: "text-cyan-500",
    borderClass: "border-l-cyan-400",
  },
};

export function getChipVisuals(type: ContextChipType): ChipVisuals {
  return CHIP_VISUALS[type];
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve chips → prompt text
// ─────────────────────────────────────────────────────────────────────────────

function resolveChip(chip: ContextChip): string {
  switch (chip.type) {
    case "file":
      return [
        "[File Context]",
        `File: ${chip.filePath}`,
        "Please read this file using your Read tool to understand its contents.",
      ].join("\n");

    case "commit":
      return buildCommitContextPrompt(chip.raw);

    case "deployment":
      return buildDeploymentContextPrompt(chip.raw);

    case "ticket":
      return buildTicketContextPrompt(chip.raw);

    case "session":
      return [
        "[Previous Conversation]",
        `Session: ${chip.firstPrompt || "Untitled session"}`,
        `Session ID: ${chip.sessionId}`,
        "Please review this previous conversation for context on what was discussed.",
      ].join("\n");

    case "github-pr":
      return [
        "[GitHub Pull Request]",
        `PR #${chip.prNumber}: ${chip.title}`,
        `URL: ${chip.url}`,
        "Please review this pull request for context.",
      ].join("\n");

    case "email":
      return buildEmailContextPrompt(chip.raw);

    case "webhook":
      return buildWebhookContextPrompt(chip.raw);

    case "cron":
      return buildCronContextPrompt(chip.raw);
  }
}

/**
 * Resolves an array of context chips into a combined prompt prefix string.
 * Each chip produces a structured section, separated by blank lines.
 */
export function resolveChipsToPrompt(chips: ContextChip[]): string {
  if (chips.length === 0) return "";

  const sections = chips.map(resolveChip).filter(Boolean);
  if (sections.length === 0) return "";

  return sections.join("\n\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Deduplication key — prevents adding the same item twice
// ─────────────────────────────────────────────────────────────────────────────

export function chipDedupeKey(chip: ContextChip): string {
  switch (chip.type) {
    case "file":
      return `file:${chip.filePath}`;
    case "commit":
      return `commit:${chip.raw.hash}`;
    case "deployment":
      return `deployment:${chip.raw.id}`;
    case "ticket":
      return `ticket:${chip.raw.identifier}`;
    case "session":
      return `session:${chip.sessionId}`;
    case "github-pr":
      return `github-pr:${chip.prNumber}`;
    case "email":
      return `email:${chip.raw.id}`;
    case "webhook":
      return `webhook:${chip.raw.id}`;
    case "cron":
      return `cron:${chip.raw.id}`;
  }
}
