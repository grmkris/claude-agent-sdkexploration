"use client";

import { getToolRenderer } from "./tool-renderers";

export function ToolUseBlock({
  name,
  input,
  output,
  is_error,
  elapsed,
  isRunning,
  projectSlug,
  toolUseId,
  onAnswer,
}: {
  name: string;
  input: Record<string, unknown>;
  output?: string;
  is_error?: boolean;
  elapsed?: number;
  isRunning?: boolean;
  projectSlug?: string;
  toolUseId?: string;
  onAnswer?: (toolUseId: string, answers: Record<string, string[]>) => void;
}) {
  const Renderer = getToolRenderer(name);
  return (
    <Renderer
      name={name}
      input={input}
      output={output}
      is_error={is_error}
      elapsed={elapsed}
      isRunning={isRunning}
      projectSlug={projectSlug}
      toolUseId={name === "AskUserQuestion" ? toolUseId : undefined}
      onAnswer={name === "AskUserQuestion" ? onAnswer : undefined}
    />
  );
}
