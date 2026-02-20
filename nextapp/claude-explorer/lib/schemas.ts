import { z } from "zod"
import type { ContentBlock } from "./types"

export const ProjectSchema = z.object({
  slug: z.string(),
  path: z.string(),
  sessionCount: z.number(),
  lastActive: z.string().optional(),
})

export const SessionMetaSchema = z.object({
  id: z.string(),
  firstPrompt: z.string(),
  timestamp: z.string(),
  model: z.string(),
  turns: z.number(),
  cost: z.number(),
  gitBranch: z.string(),
  isActive: z.boolean(),
  lastModified: z.string(),
  resumeCommand: z.string(),
})

export const ParsedMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.array(z.custom<ContentBlock>()),
  timestamp: z.string(),
  uuid: z.string(),
  model: z.string().optional(),
})

export const RecentSessionSchema = SessionMetaSchema.extend({
  projectSlug: z.string(),
  projectPath: z.string(),
})

export const FavoritesSchema = z.object({
  projects: z.array(z.string()),
  sessions: z.array(z.string()),
})

export type Project = z.infer<typeof ProjectSchema>
export type SessionMeta = z.infer<typeof SessionMetaSchema>
export type RecentSession = z.infer<typeof RecentSessionSchema>
export type Favorites = z.infer<typeof FavoritesSchema>
export type ParsedMessage = z.infer<typeof ParsedMessageSchema>
