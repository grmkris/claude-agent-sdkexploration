import { os, eventIterator } from "@orpc/server"
import { z } from "zod"
import {
  listProjects,
  listSessions,
  getSessionMessages,
  getRecentSessions,
  getFavorites,
  toggleFavoriteProject,
  toggleFavoriteSession,
} from "./claude-fs"
import {
  ProjectSchema,
  SessionMetaSchema,
  RecentSessionSchema,
  FavoritesSchema,
  ParsedMessageSchema,
} from "./schemas"
import { query } from "@anthropic-ai/claude-agent-sdk"
import { MCP_SERVERS } from "./mcp-servers"
import type { SDKMessage } from "./types"

const listProjectsProc = os
  .output(z.array(ProjectSchema))
  .handler(async () => listProjects())

const listSessionsProc = os
  .input(z.object({ slug: z.string() }))
  .output(z.array(SessionMetaSchema))
  .handler(async ({ input }) => listSessions(input.slug))

const getMessagesProc = os
  .input(z.object({ slug: z.string(), sessionId: z.string() }))
  .output(z.array(ParsedMessageSchema))
  .handler(async ({ input }) => getSessionMessages(input.slug, input.sessionId))

const recentSessionsProc = os
  .input(z.object({ limit: z.number().optional() }))
  .output(z.array(RecentSessionSchema))
  .handler(async ({ input }) => getRecentSessions(input.limit))

const getFavoritesProc = os
  .output(FavoritesSchema)
  .handler(async () => getFavorites())

const toggleFavoriteProjectProc = os
  .input(z.object({ slug: z.string() }))
  .output(FavoritesSchema)
  .handler(async ({ input }) => toggleFavoriteProject(input.slug))

const toggleFavoriteSessionProc = os
  .input(z.object({ id: z.string() }))
  .output(FavoritesSchema)
  .handler(async ({ input }) => toggleFavoriteSession(input.id))

const chatProc = os
  .input(
    z.object({
      prompt: z.string(),
      resume: z.string().optional(),
      cwd: z.string().optional(),
    })
  )
  .output(eventIterator(z.custom<SDKMessage>()))
  .handler(async function* ({ input }) {
    const conversation = query({
      prompt: input.prompt,
      options: {
        model: "claude-sonnet-4-6",
        executable: "bun",
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        mcpServers: MCP_SERVERS,
        ...(input.resume ? { resume: input.resume } : {}),
        ...(input.cwd ? { cwd: input.cwd } : {}),
      },
    })

    for await (const msg of conversation) {
      yield msg
    }
  })

export const router = {
  projects: { list: listProjectsProc },
  sessions: { list: listSessionsProc, messages: getMessagesProc, recent: recentSessionsProc },
  favorites: { get: getFavoritesProc, toggleProject: toggleFavoriteProjectProc, toggleSession: toggleFavoriteSessionProc },
  chat: chatProc,
}
