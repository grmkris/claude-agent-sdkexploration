import type {
  SDKAssistantMessage,
  SDKUserMessage,
  SDKUserMessageReplay,
  SDKResultMessage,
  SDKSystemMessage,
  SDKPartialAssistantMessage,
  SDKCompactBoundaryMessage,
  SDKStatusMessage,
  SDKHookStartedMessage,
  SDKHookProgressMessage,
  SDKHookResponseMessage,
  SDKToolProgressMessage,
  SDKAuthStatusMessage,
  SDKTaskNotificationMessage,
  SDKTaskStartedMessage,
  SDKFilesPersistedEvent,
  SDKToolUseSummaryMessage,
} from "@anthropic-ai/claude-agent-sdk/sdk";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages/messages";

export type SDKMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKUserMessageReplay
  | SDKResultMessage
  | SDKSystemMessage
  | SDKPartialAssistantMessage
  | SDKCompactBoundaryMessage
  | SDKStatusMessage
  | SDKHookStartedMessage
  | SDKHookProgressMessage
  | SDKHookResponseMessage
  | SDKToolProgressMessage
  | SDKAuthStatusMessage
  | SDKTaskNotificationMessage
  | SDKTaskStartedMessage
  | SDKFilesPersistedEvent
  | SDKToolUseSummaryMessage;

export type SDKContentBlock = SDKAssistantMessage["message"]["content"][number];

type EnrichedToolUse = Extract<SDKContentBlock, { type: "tool_use" }> & {
  input: Record<string, unknown>;
  output?: string;
  is_error?: boolean;
  elapsed?: number;
};

export type ResultBlock = {
  type: "result";
  costUSD?: number;
  durationMs?: number;
  durationApiMs?: number;
  numTurns?: number;
  inputTokens?: number;
  outputTokens?: number;
  isError?: boolean;
  subtype?: string;
};

export type SystemEventBlock = {
  type: "system_event";
  subtype: string;
  message: string;
  detail?: string;
};

export type ToolUseSummaryBlock = {
  type: "tool_use_summary";
  toolName: string;
  filepath?: string;
  summary?: string;
};

export type UserImageBlock = {
  type: "user_image";
  dataUrl: string; // data: URL for <img src> — display only, never persisted
};

export type AttachedImage = {
  id: string; // crypto.randomUUID() for React key / removal
  dataUrl: string; // "data:image/png;base64,..." — used for <img src>
  base64: string; // raw base64 without the data: prefix — sent to backend
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  sizeBytes: number;
};

export type ContentBlock =
  | Exclude<SDKContentBlock, { type: "tool_use" }>
  | EnrichedToolUse
  | ResultBlock
  | SystemEventBlock
  | ToolUseSummaryBlock
  | UserImageBlock;

export type {
  Project,
  SessionMeta,
  SessionState,
  RecentSession,
  Favorites,
  ParsedMessage,
  CronJob,
  AgentMessage,
  TmuxPane,
  WebhookConfig,
  WebhookEvent,
  CronEvent,
  ExplorerStore,
  DailyActivity,
  GlobalStats,
  SessionFacet,
  SkillUsageEntry,
  ApiKey,
  ApiKeyProvider,
  IntegrationConfig,
  IntegrationWidget,
  WidgetItem,
  RootWorkspace,
  WorkspaceEmailConfig,
  EmailEvent,
  OAuthApp,
} from "./schemas";

export type PushSubscription = {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  createdAt: string;
};

export type NotificationSettings = {
  sessionCompleted: boolean;
  sessionFailed: boolean;
  sessionNeedsPermission: boolean;
  deploymentCompleted: boolean;
  deploymentFailed: boolean;
  githubPush: boolean;
  githubPR: boolean;
  cronCompleted: boolean;
  cronFailed: boolean;
  emailReceived: boolean;
  webhookTriggered: boolean;
};

export type RawUserMessage = {
  type: "user";
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  cwd: string;
  gitBranch: string;
  version: string;
  sessionId: string;
  message: MessageParam;
};

export type RawAssistantMessage = {
  type: "assistant";
  uuid: string;
  parentUuid: string;
  timestamp: string;
  cwd: string;
  gitBranch: string;
  version: string;
  sessionId: string;
  requestId: string;
  message: BetaMessage;
};

export type RawJSONLLine =
  | RawUserMessage
  | RawAssistantMessage
  | { type: "queue-operation"; [key: string]: unknown }
  | { type: "file-history-snapshot"; [key: string]: unknown }
  | { type: "progress"; [key: string]: unknown }
  | { type: string; [key: string]: unknown };
