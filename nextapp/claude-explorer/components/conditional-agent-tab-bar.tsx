"use client";

import { usePathname } from "next/navigation";

import { AgentTabBar } from "@/components/agent-tabs/agent-tab-bar";
import { useWorkspace } from "@/lib/workspace-context";

/**
 * Renders AgentTabBar only when the workspace multi-panel view is NOT active.
 * When workspace panels are showing, PanelHeader handles all header functionality.
 */
export function ConditionalAgentTabBar() {
  const { hasPanels } = useWorkspace();
  const pathname = usePathname();
  const isSessionRoute = /\/chat(\/|$)/.test(pathname);

  // Hide when workspace is showing panels on a session route
  if (hasPanels && isSessionRoute) return null;

  return <AgentTabBar />;
}
