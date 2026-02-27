"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { AgentTabProvider } from "@/components/agent-tabs/tab-context";
import { useLiveUpdates } from "@/hooks/use-live-updates";
import { CompactProvider } from "@/lib/session-compact-context";

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
          <CompactProvider>{children}</CompactProvider>
        </AgentTabProvider>
      </LiveUpdatesProvider>
    </QueryClientProvider>
  );
}
