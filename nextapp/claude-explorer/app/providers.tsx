"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useState } from "react";

import { AgentTabProvider } from "@/components/agent-tabs/tab-context";
import { ContextTrayProvider } from "@/components/context-tray/context-tray-context";
import { useLiveUpdates } from "@/hooks/use-live-updates";
import { CommandPaletteProvider } from "@/lib/command-palette-context";
import { CompactProvider } from "@/lib/session-compact-context";
import { WorkspaceProvider } from "@/lib/workspace-context";

function LiveUpdatesProvider({ children }: { children: React.ReactNode }) {
  useLiveUpdates();
  return <>{children}</>;
}

export function Providers({
  children,
  tabBarVisible,
}: {
  children: React.ReactNode;
  tabBarVisible?: boolean;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  return (
    <QueryClientProvider client={queryClient}>
      <LiveUpdatesProvider>
        <AgentTabProvider defaultVisible={tabBarVisible}>
          <CompactProvider>
            <Suspense>
              <WorkspaceProvider>
                <CommandPaletteProvider>
                  <ContextTrayProvider>{children}</ContextTrayProvider>
                </CommandPaletteProvider>
              </WorkspaceProvider>
            </Suspense>
          </CompactProvider>
        </AgentTabProvider>
      </LiveUpdatesProvider>
    </QueryClientProvider>
  );
}
