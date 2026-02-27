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
  sessionId,
  toolUseId,
  onAnswer,
  onApprovePlan,
}: {
  name: string;
  input: Record<string, unknown>;
  output?: string;
  is_error?: boolean;
  elapsed?: number;
  isRunning?: boolean;
  projectSlug?: string;
  sessionId?: string;
  toolUseId?: string;
  onAnswer?: (toolUseId: string, answers: Record<string, string[]>) => void;
  onApprovePlan?: (
    toolUseId: string,
    approved: boolean,
    feedback?: string
  ) => void;
}) {
  const Renderer = getToolRenderer(name);
  const isAskUser = name === "AskUserQuestion";
  const isExitPlan = name === "ExitPlanMode";
  return (
    <Renderer
      name={name}
      input={input}
      output={output}
      is_error={is_error}
      elapsed={elapsed}
      isRunning={isRunning}
      projectSlug={projectSlug}
      toolUseId={isAskUser || isExitPlan ? toolUseId : undefined}
      sessionId={isExitPlan ? sessionId : undefined}
      onAnswer={isAskUser ? onAnswer : undefined}
      onApprovePlan={isExitPlan ? onApprovePlan : undefined}
    />
  );
}
