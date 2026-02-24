/**
 * Linear Agent utilities — all actions use the bot token (OAuth client credentials)
 * so they appear as the "Claude Explorer" app identity.
 *
 * Agent Activities use the @linear/sdk built-in methods.
 * CRUD operations use the SDK's LinearClient.
 */

import { LinearClient } from "@linear/sdk";

import { getLinearBotToken } from "./oauth/linear-client-credentials";

// ---------------------------------------------------------------------------
// Bot-authenticated LinearClient (lazy singleton, refreshes on token expiry)
// ---------------------------------------------------------------------------

let _client: LinearClient | null = null;
let _tokenExpiresAt = 0;

async function getClient(): Promise<LinearClient> {
  if (_client && Date.now() < _tokenExpiresAt - 60_000) return _client;
  const { accessToken, expiresAt } = await getLinearBotToken();
  _client = new LinearClient({ accessToken });
  _tokenExpiresAt = new Date(expiresAt).getTime();
  return _client;
}

// ---------------------------------------------------------------------------
// Agent Activities (Linear agent protocol)
// ---------------------------------------------------------------------------

export type ActivityType =
  | "thought"
  | "action"
  | "response"
  | "error"
  | "elicitation";

interface ActivityContentMap {
  thought: { type: "thought"; body: string };
  elicitation: { type: "elicitation"; body: string };
  action: {
    type: "action";
    action: string;
    parameter: string;
    result?: string;
  };
  response: { type: "response"; body: string };
  error: { type: "error"; body: string };
}

export async function emitActivity<T extends ActivityType>(
  agentSessionId: string,
  type: T,
  content: Omit<ActivityContentMap[T], "type">,
  opts?: { ephemeral?: boolean }
): Promise<{ success: boolean; activityId?: string }> {
  const client = await getClient();
  const result = await client.createAgentActivity({
    agentSessionId,
    content: { type, ...content } as Record<string, unknown>,
    ephemeral: opts?.ephemeral,
  });
  return {
    success: result.success,
    activityId: result.agentActivity
      ? (await result.agentActivity).id
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Session Plan
// ---------------------------------------------------------------------------

export interface PlanTask {
  content: string;
  status: "pending" | "inProgress" | "completed" | "canceled";
}

export async function updateSessionPlan(
  agentSessionId: string,
  tasks: PlanTask[]
): Promise<{ success: boolean }> {
  const client = await getClient();
  const result = await client.updateAgentSession(agentSessionId, {
    plan: tasks as unknown as Record<string, unknown>,
  });
  return { success: result.success };
}

// ---------------------------------------------------------------------------
// Delegate — set bot as delegate on an issue
// ---------------------------------------------------------------------------

export async function setDelegate(
  issueId: string
): Promise<{ success: boolean }> {
  const client = await getClient();
  // Get the bot's own user ID via viewer
  const viewer = await client.viewer;
  const result = await client.updateIssue(issueId, {
    delegateId: viewer.id,
  });
  return { success: result.success };
}

// ---------------------------------------------------------------------------
// Move issue to first "started" state
// ---------------------------------------------------------------------------

export async function moveToStarted(
  issueId: string,
  teamId: string
): Promise<{ success: boolean; stateName?: string }> {
  const client = await getClient();
  const states = await client.workflowStates({
    filter: { team: { id: { eq: teamId } }, type: { eq: "started" } },
  });
  const startedState = states.nodes[0];
  if (!startedState) return { success: false };

  const result = await client.updateIssue(issueId, {
    stateId: startedState.id,
  });
  return { success: result.success, stateName: startedState.name };
}

// ---------------------------------------------------------------------------
// CRUD: Issues
// ---------------------------------------------------------------------------

export async function createIssue(opts: {
  title: string;
  teamId: string;
  description?: string;
  assigneeId?: string;
  priority?: number;
  labelIds?: string[];
  stateId?: string;
}): Promise<{
  success: boolean;
  issueId?: string;
  identifier?: string;
  url?: string;
}> {
  const client = await getClient();
  const result = await client.createIssue({
    title: opts.title,
    teamId: opts.teamId,
    description: opts.description,
    assigneeId: opts.assigneeId,
    priority: opts.priority,
    labelIds: opts.labelIds,
    stateId: opts.stateId,
  });
  const issue = result.issue ? await result.issue : null;
  return {
    success: result.success,
    issueId: issue?.id,
    identifier: issue?.identifier,
    url: issue?.url,
  };
}

export async function updateIssue(
  issueId: string,
  fields: {
    title?: string;
    description?: string;
    stateId?: string;
    assigneeId?: string;
    priority?: number;
    labelIds?: string[];
    delegateId?: string;
  }
): Promise<{ success: boolean }> {
  const client = await getClient();
  const result = await client.updateIssue(issueId, fields);
  return { success: result.success };
}

// ---------------------------------------------------------------------------
// CRUD: Comments
// ---------------------------------------------------------------------------

export async function addComment(
  issueId: string,
  body: string
): Promise<{ success: boolean; commentId?: string }> {
  const client = await getClient();
  const result = await client.createComment({ issueId, body });
  const comment = result.comment ? await result.comment : null;
  return { success: result.success, commentId: comment?.id };
}

// ---------------------------------------------------------------------------
// CRUD: List assigned / delegated issues
// ---------------------------------------------------------------------------

export async function listAssignedIssues(teamId?: string): Promise<
  Array<{
    id: string;
    identifier: string;
    title: string;
    url: string;
    state: string;
    priority: number;
  }>
> {
  const client = await getClient();
  const viewer = await client.viewer;

  const filter: Record<string, unknown> = {
    or: [
      { assignee: { id: { eq: viewer.id } } },
      { delegate: { id: { eq: viewer.id } } },
    ],
  };
  if (teamId) {
    filter.team = { id: { eq: teamId } };
  }

  const issues = await client.issues({ filter });
  const results = await Promise.all(
    issues.nodes.map(async (issue) => {
      const state = await issue.state;
      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        state: state?.name ?? "Unknown",
        priority: issue.priority,
      };
    })
  );
  return results;
}

// ---------------------------------------------------------------------------
// Proactive session creation
// ---------------------------------------------------------------------------

export async function createSessionOnIssue(
  issueId: string
): Promise<{ success: boolean; sessionId?: string }> {
  const client = await getClient();
  const result = await client.agentSessionCreateOnIssue({ issueId });
  const session = result.agentSession ? await result.agentSession : null;
  return { success: result.success, sessionId: session?.id };
}
