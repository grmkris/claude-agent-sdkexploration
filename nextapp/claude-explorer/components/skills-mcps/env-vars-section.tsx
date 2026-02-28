"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";

export function EnvVarsSection({
  slug,
  compact = false,
}: {
  slug: string;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: projectConfig } = useQuery({
    ...orpc.projects.config.queryOptions({ input: { slug } }),
    enabled: !!slug,
  });

  const [localEnv, setLocalEnv] = useState<Record<string, string> | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  const env = localEnv ?? projectConfig?.env ?? {};

  const save = useMutation({
    mutationFn: (updated: Record<string, string>) =>
      client.projects.setEnv({ slug, env: updated }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.projects.config.queryOptions({ input: { slug } })
          .queryKey,
      });
    },
  });

  const updateVar = (key: string, value: string) => {
    const updated = { ...env, [key]: value };
    setLocalEnv(updated);
    save.mutate(updated);
  };

  const removeVar = (key: string) => {
    const updated = { ...env };
    delete updated[key];
    setLocalEnv(updated);
    save.mutate(updated);
  };

  const addVar = () => {
    if (!newKey.trim()) return;
    const updated = { ...env, [newKey.trim()]: newVal };
    setLocalEnv(updated);
    setNewKey("");
    setNewVal("");
    save.mutate(updated);
  };

  const content = (
    <div className="flex flex-col gap-1 px-2 pb-1">
      {Object.entries(env).map(([key, value]) => (
        <div key={key} className="flex items-center gap-1">
          <span className="w-24 shrink-0 truncate font-mono text-[10px] text-muted-foreground">
            {key}
          </span>
          <Input
            value={value}
            onChange={(e) => updateVar(key, e.target.value)}
            className="h-5 flex-1 font-mono text-[10px]"
          />
          <button
            onClick={() => removeVar(key)}
            title="Remove variable"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3 w-3"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1 pt-1">
        <Input
          placeholder="KEY"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addVar()}
          className="h-5 w-20 shrink-0 font-mono text-[10px]"
        />
        <Input
          placeholder="value"
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addVar()}
          className="h-5 flex-1 font-mono text-[10px]"
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-5 shrink-0 px-1.5 text-[10px]"
          disabled={!newKey.trim()}
          onClick={addVar}
        >
          +
        </Button>
      </div>
    </div>
  );

  if (compact) {
    return (
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="flex h-8 w-full cursor-pointer select-none items-center px-2 text-left text-xs font-medium text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground">
          Environment Variables ({Object.keys(env).length})
        </CollapsibleTrigger>
        <CollapsibleContent>{content}</CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <Collapsible defaultOpen={Object.keys(env).length > 0}>
      <CollapsibleTrigger className="flex h-8 w-full cursor-pointer select-none items-center text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        Environment Variables ({Object.keys(env).length})
      </CollapsibleTrigger>
      <CollapsibleContent>{content}</CollapsibleContent>
    </Collapsible>
  );
}
