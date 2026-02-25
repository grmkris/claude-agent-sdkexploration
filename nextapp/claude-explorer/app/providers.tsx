"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { useLiveUpdates } from "@/hooks/use-live-updates";

function LiveUpdatesProvider({ children }: { children: React.ReactNode }) {
  useLiveUpdates();
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
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
      <LiveUpdatesProvider>{children}</LiveUpdatesProvider>
    </QueryClientProvider>
  );
}
