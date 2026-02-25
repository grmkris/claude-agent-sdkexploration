"use client";

import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getTimeAgo } from "@/lib/utils";

const stateConfig: Record<
  string,
  { color: string; pulse?: boolean; label: string }
> = {
  initializing: { color: "bg-yellow-500", pulse: true, label: "Initializing" },
  thinking: { color: "bg-green-500", pulse: true, label: "Thinking" },
  tool_running: { color: "bg-blue-500", pulse: false, label: "Running" },
  subagent_running: { color: "bg-purple-500", pulse: false, label: "Subagent" },
  compacting: { color: "bg-yellow-500", pulse: false, label: "Compacting" },
  waiting_for_permission: {
    color: "bg-yellow-500",
    pulse: false,
    label: "Waiting",
  },
  stopped: { color: "bg-gray-400", pulse: false, label: "Stopped" },
  done: { color: "bg-gray-400", pulse: false, label: "Done" },
  error: { color: "bg-red-500", pulse: false, label: "Error" },
};

export function SessionStateBadge({
  sessionId,
  compact,
}: {
  sessionId: string;
  compact?: boolean;
}) {
  const { data } = useQuery(
    orpc.liveState.session.queryOptions({ input: { sessionId } })
  );

  if (!data) return null;

  const cfg = stateConfig[data.state] ?? stateConfig.done;
  const label =
    data.state === "tool_running" && data.current_tool
      ? data.current_tool
      : cfg.label;
  const timeAgo = getTimeAgo(data.updated_at);

  const dot = (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.color} ${cfg.pulse ? "animate-pulse" : ""}`}
    />
  );

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center">{dot}</span>
          </TooltipTrigger>
          <TooltipContent side="right">
            {label} · {timeAgo}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {dot}
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-[10px] text-muted-foreground/60">· {timeAgo}</span>
    </span>
  );
}

/** Inline badge when you already have the state string (no query needed) */
export function StateBadgeInline({
  state,
  currentTool,
  compact,
  updatedAt,
}: {
  state: string;
  currentTool?: string | null;
  compact?: boolean;
  updatedAt?: string;
}) {
  const cfg = stateConfig[state] ?? stateConfig.done;
  const label =
    state === "tool_running" && currentTool ? currentTool : cfg.label;
  const timeAgo = updatedAt ? getTimeAgo(updatedAt) : null;

  const dot = (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.color} ${cfg.pulse ? "animate-pulse" : ""}`}
    />
  );

  if (compact) {
    const tooltipText = timeAgo ? `${label} · ${timeAgo}` : label;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center">{dot}</span>
          </TooltipTrigger>
          <TooltipContent side="right">{tooltipText}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {dot}
      <span className="text-[10px] text-muted-foreground">{label}</span>
      {timeAgo && (
        <span className="text-[10px] text-muted-foreground/60">· {timeAgo}</span>
      )}
    </span>
  );
}
