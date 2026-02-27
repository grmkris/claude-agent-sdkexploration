import type { ComponentType } from "react";

export type ToolRendererProps = {
  name: string;
  input: Record<string, unknown>;
  output?: string;
  is_error?: boolean;
  elapsed?: number;
  isRunning?: boolean;
  projectSlug?: string;
  /** Only set for AskUserQuestion blocks */
  toolUseId?: string;
  /** Callback invoked when the user answers an AskUserQuestion */
  onAnswer?: (toolUseId: string, answers: Record<string, string[]>) => void;
};

/** Safely stringify an unknown value from tool input */
export function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value);
}

import { AskUserQuestionTool } from "./ask-user-question-tool";
import { BashTool } from "./bash-tool";
import { FileTool } from "./file-tool";
import { GenericTool } from "./generic-tool";
import { SearchTool } from "./search-tool";
import { TaskTool } from "./task-tool";
import { WebTool } from "./web-tool";

const toolMap: Record<string, ComponentType<ToolRendererProps>> = {
  AskUserQuestion: AskUserQuestionTool,
  Bash: BashTool,
  Read: FileTool,
  Write: FileTool,
  Edit: FileTool,
  NotebookEdit: FileTool,
  Glob: SearchTool,
  Grep: SearchTool,
  WebFetch: WebTool,
  WebSearch: WebTool,
  Task: TaskTool,
};

/** Strip MCP server prefix: "mcp__server__toolName" → "toolName" */
function stripMcpPrefix(name: string): string {
  if (name.startsWith("mcp__")) {
    const parts = name.split("__");
    return parts[parts.length - 1];
  }
  return name;
}

export function getToolRenderer(
  name: string
): ComponentType<ToolRendererProps> {
  return toolMap[name] ?? toolMap[stripMcpPrefix(name)] ?? GenericTool;
}
