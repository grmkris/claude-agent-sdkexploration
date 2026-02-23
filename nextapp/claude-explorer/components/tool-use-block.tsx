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
}: {
  name: string;
  input: Record<string, unknown>;
  output?: string;
  is_error?: boolean;
  elapsed?: number;
  isRunning?: boolean;
  projectSlug?: string;
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
    />
  );
}
