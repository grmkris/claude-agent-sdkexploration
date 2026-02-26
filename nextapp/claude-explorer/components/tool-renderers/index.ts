import type { ComponentType } from "react";

export type ToolRendererProps = {
  name: string;
  input: Record<string, unknown>;
  output?: string;
  is_error?: boolean;
  elapsed?: number;
  isRunning?: boolean;
  projectSlug?: string;
  mcpServer?: string;
};

/** Safely stringify an unknown value from tool input */
export function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value);
}

import { BashTool } from "./bash-tool";
import { FileTool } from "./file-tool";
import { GenericTool } from "./generic-tool";
import { SearchTool } from "./search-tool";
import { TaskTool } from "./task-tool";
import { WebTool } from "./web-tool";

const toolMap: Record<string, ComponentType<ToolRendererProps>> = {
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

/** Parse MCP tool name: "mcp__server__toolName" → { server: "server", tool: "toolName" } */
export function parseMcpToolName(name: string): {
  server?: string;
  tool: string;
} {
  if (name.startsWith("mcp__")) {
    const parts = name.split("__");
    if (parts.length >= 3)
      return { server: parts[1], tool: parts.slice(2).join("__") };
  }
  return { tool: name };
}

export function getToolRenderer(
  name: string
): ComponentType<ToolRendererProps> {
  return toolMap[name] ?? toolMap[parseMcpToolName(name).tool] ?? GenericTool;
}
