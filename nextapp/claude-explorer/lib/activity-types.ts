export type ActivityItemType =
  | "commit"
  | "deployment"
  | "ticket"
  | "email"
  | "webhook"
  | "cron";

export interface CommitRaw {
  hash: string;
  shortHash: string;
  subject: string;
  body: string;
  author: string;
  date: string;
  branch?: string;
}

export interface DeploymentRaw {
  id: string;
  status: string;
  statusColor: string;
  serviceName: string;
  createdAt: string;
  commitMessage?: string;
  commitHash?: string;
  dashboardUrl?: string;
  githubUrl?: string;
  /** Live service URL, e.g. https://myapp.railway.app */
  serviceUrl?: string;
  /** Railway logs URL with environment + service filter */
  logsUrl?: string;
}

export interface TicketRaw {
  identifier: string;
  title: string;
  description?: string;
  status: string;
  statusColor: string;
  priority?: number;
  assignee?: string;
  url: string;
  updatedAt?: string;
}

export interface EmailEventRaw {
  id: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  subject?: string;
  status: "success" | "error" | "running";
  sessionId?: string;
  timestamp: string;
  projectSlug: string;
}

export interface WebhookEventRaw {
  id: string;
  webhookId: string;
  provider: string;
  eventType: string;
  action: string;
  payloadSummary: string;
  status: "success" | "error" | "running";
  sessionId?: string;
  timestamp: string;
}

export interface CronEventRaw {
  id: string;
  cronId: string;
  expression: string;
  prompt: string;
  status: "success" | "error" | "running";
  sessionId?: string;
  error?: string;
  timestamp: string;
}

export interface ActivityItem {
  /** Unique key: "commit:{hash}", "deploy:{id}", "ticket:{identifier}", "email:{id}", "webhook:{id}", "cron:{id}" */
  id: string;
  type: ActivityItemType;
  timestamp: string;
  title: string;
  subtitle?: string;
  status?: string;
  statusColor?: string;
  url?: string;
  raw:
    | CommitRaw
    | DeploymentRaw
    | TicketRaw
    | EmailEventRaw
    | WebhookEventRaw
    | CronEventRaw;
}
