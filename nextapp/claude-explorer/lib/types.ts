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

export type ContentBlock =
  | Exclude<SDKContentBlock, { type: "tool_use" }>
  | EnrichedToolUse
  | ResultBlock
  | SystemEventBlock
  | ToolUseSummaryBlock;

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
} from "./schemas";

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
