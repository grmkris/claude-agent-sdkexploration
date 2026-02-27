export type ActivityItemType = "commit" | "deployment" | "ticket";

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

export interface ActivityItem {
  /** Unique key: "commit:{hash}", "deploy:{id}", "ticket:{identifier}" */
  id: string;
  type: ActivityItemType;
  timestamp: string;
  title: string;
  subtitle?: string;
  status?: string;
  statusColor?: string;
  url?: string;
  raw: CommitRaw | DeploymentRaw | TicketRaw;
}
