"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { cn } from "@/lib/utils";

type McpScope = "user" | "local" | "project";

function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  }
  return env;
}

function parseHeaders(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon > 0) {
      headers[trimmed.slice(0, colon).trim()] = trimmed.slice(colon + 1).trim();
    }
  }
  return headers;
}

export function AddMcpForm({
  slug,
  defaultScope,
  showScopeSelector = false,
  compact = false,
  onDone,
}: {
  slug?: string;
  defaultScope?: McpScope;
  showScopeSelector?: boolean;
  compact?: boolean;
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: projects } = useQuery({
    ...orpc.projects.list.queryOptions(),
    enabled: showScopeSelector,
  });

  const resolvedDefault = defaultScope ?? (slug ? "local" : "user");
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "http" | "sse">("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [scope, setScope] = useState<McpScope>(resolvedDefault);
  const [selectedSlug, setSelectedSlug] = useState(slug ?? "");
  const [envText, setEnvText] = useState("");
  const [showEnv, setShowEnv] = useState(false);
  const [headersText, setHeadersText] = useState("");
  const [showHeaders, setShowHeaders] = useState(false);
  const [selectedApiKeyId, setSelectedApiKeyId] = useState("");

  // Vault keys for token dropdown
  const { data: vaultKeys } = useQuery(orpc.apiKeys.list.queryOptions());

  const effectiveSlug = slug ?? selectedSlug;

  const add = useMutation({
    mutationFn: () => {
      const env = envText.trim() ? parseEnv(envText) : undefined;
      const headers =
        !selectedApiKeyId && headersText.trim()
          ? parseHeaders(headersText)
          : undefined;
      return client.mcpServers.add({
        name,
        scope,
        transport,
        ...(transport === "stdio"
          ? { command, args: args ? args.split(/[,\s]+/).filter(Boolean) : [] }
          : {}),
        ...(transport !== "stdio" ? { url } : {}),
        ...(env && Object.keys(env).length > 0 ? { env } : {}),
        ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
        ...(selectedApiKeyId
          ? {
              apiKeyId: selectedApiKeyId,
              headerTemplate: { Authorization: "Bearer {{TOKEN}}" },
            }
          : {}),
        ...(scope !== "user" && effectiveSlug ? { slug: effectiveSlug } : {}),
      });
    },
    onSuccess: async (result) => {
      if (!result.success) return;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.user.config.queryOptions().queryKey,
        }),
        ...(effectiveSlug
          ? [
              queryClient.invalidateQueries({
                queryKey: orpc.projects.config.queryOptions({
                  input: { slug: effectiveSlug },
                }).queryKey,
              }),
            ]
          : []),
      ]);
      setName("");
      setCommand("");
      setArgs("");
      setUrl("");
      setEnvText("");
      setShowEnv(false);
      setHeadersText("");
      setShowHeaders(false);
      setSelectedApiKeyId("");
      onDone?.();
    },
  });

  if (compact) {
    return (
      <div className="flex flex-col gap-1.5 rounded border bg-background p-2 text-xs">
        <Input
          placeholder="Server name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-6 text-xs"
        />
        <div className="flex gap-1">
          {(["stdio", "http", "sse"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTransport(t)}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] transition-colors",
                transport === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        {transport === "stdio" ? (
          <Input
            placeholder="command (e.g. npx my-mcp-server)"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="h-6 text-xs"
          />
        ) : (
          <Input
            placeholder="URL (e.g. https://mcp.example.com)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="h-6 text-xs"
          />
        )}
        {!showEnv && (
          <button
            onClick={() => setShowEnv(true)}
            className="text-left text-[10px] text-muted-foreground hover:text-foreground"
          >
            + Env vars
          </button>
        )}
        {showEnv && (
          <textarea
            placeholder={"KEY=value\nANOTHER=value"}
            value={envText}
            onChange={(e) => setEnvText(e.target.value)}
            rows={2}
            className="rounded border bg-background px-2 py-1 text-[10px] font-mono placeholder:text-muted-foreground focus:outline-none"
          />
        )}
        {transport !== "stdio" && !showHeaders && (
          <button
            onClick={() => setShowHeaders(true)}
            className="text-left text-[10px] text-muted-foreground hover:text-foreground"
          >
            + Headers
          </button>
        )}
        {transport !== "stdio" && showHeaders && (
          <>
            {vaultKeys && vaultKeys.length > 0 && (
              <select
                value={selectedApiKeyId}
                onChange={(e) => setSelectedApiKeyId(e.target.value)}
                className="rounded border bg-background px-2 py-0.5 text-[10px]"
              >
                <option value="">Enter manually...</option>
                {vaultKeys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label} ({k.provider})
                  </option>
                ))}
              </select>
            )}
            {selectedApiKeyId ? (
              <p className="text-[10px] text-muted-foreground">
                Auth header will use the selected vault key.
              </p>
            ) : (
              <textarea
                placeholder={"Authorization: Bearer token\nX-Custom: value"}
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
                rows={2}
                className="rounded border bg-background px-2 py-1 text-[10px] font-mono placeholder:text-muted-foreground focus:outline-none"
              />
            )}
          </>
        )}
        {add.isError && (
          <p className="text-[10px] text-destructive">
            {(add.error as Error).message}
          </p>
        )}
        {add.data && !add.data.success && (
          <p className="text-[10px] text-destructive">{add.data.error}</p>
        )}
        <div className="flex gap-1">
          <Button
            size="sm"
            className="h-6 flex-1 text-xs"
            disabled={
              !name ||
              (transport === "stdio" ? !command : !url) ||
              add.isPending
            }
            onClick={() => add.mutate()}
          >
            {add.isPending ? "Adding\u2026" : "Add"}
          </Button>
          {onDone && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs"
              onClick={onDone}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Full-size form
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap">
        <Input
          placeholder="Server name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-48"
        />
        <select
          value={transport}
          onChange={(e) => setTransport(e.target.value as typeof transport)}
          className="rounded border bg-background px-2 text-sm"
        >
          <option value="stdio">stdio</option>
          <option value="http">http</option>
          <option value="sse">sse</option>
        </select>
        {showScopeSelector && (
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as McpScope)}
            className="rounded border bg-background px-2 text-sm"
          >
            <option value="user">User</option>
            <option value="local">Local</option>
            <option value="project">Project</option>
          </select>
        )}
        {showScopeSelector && scope !== "user" && !slug && (
          <select
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            className="rounded border bg-background px-2 text-sm"
          >
            <option value="">Select project...</option>
            {projects?.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.path.split("/").slice(-2).join("/")}
              </option>
            ))}
          </select>
        )}
      </div>
      {transport === "stdio" ? (
        <div className="flex gap-2">
          <Input
            placeholder="Command (e.g. npx, bunx)"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="w-48"
          />
          <Input
            placeholder="Args (space or comma separated)"
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            className="flex-1"
          />
        </div>
      ) : (
        <Input
          placeholder="URL (e.g. https://mcp.example.com/sse)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      )}
      <div>
        <button
          onClick={() => setShowEnv(!showEnv)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {showEnv ? "Hide env vars" : "+ Env vars (optional)"}
        </button>
        {showEnv && (
          <textarea
            placeholder={"KEY=value\nANOTHER=value"}
            value={envText}
            onChange={(e) => setEnvText(e.target.value)}
            className="mt-1 w-full min-h-[60px] rounded border bg-background px-3 py-2 text-sm font-mono"
          />
        )}
      </div>
      {transport !== "stdio" && (
        <div>
          <button
            onClick={() => setShowHeaders(!showHeaders)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {showHeaders ? "Hide headers" : "+ Headers (optional)"}
          </button>
          {showHeaders && (
            <div className="mt-1 flex flex-col gap-2">
              {vaultKeys && vaultKeys.length > 0 && (
                <select
                  value={selectedApiKeyId}
                  onChange={(e) => setSelectedApiKeyId(e.target.value)}
                  className="rounded border bg-background px-2 py-1 text-sm"
                >
                  <option value="">Enter manually...</option>
                  {vaultKeys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label} ({k.provider})
                    </option>
                  ))}
                </select>
              )}
              {selectedApiKeyId ? (
                <p className="text-xs text-muted-foreground">
                  Authorization header will use the selected vault key.
                </p>
              ) : (
                <textarea
                  placeholder={"Authorization: Bearer token\nX-Custom: value"}
                  value={headersText}
                  onChange={(e) => setHeadersText(e.target.value)}
                  className="w-full min-h-[60px] rounded border bg-background px-3 py-2 text-sm font-mono"
                />
              )}
            </div>
          )}
        </div>
      )}
      <Button
        size="sm"
        className="w-fit"
        disabled={
          !name ||
          (transport === "stdio" ? !command : !url) ||
          add.isPending ||
          (showScopeSelector && scope !== "user" && !effectiveSlug)
        }
        onClick={() => add.mutate()}
      >
        {add.isPending ? "Adding..." : "Add Server"}
      </Button>
      {add.isError && (
        <p className="text-xs text-red-400">{(add.error as Error).message}</p>
      )}
      {add.data && !add.data.success && (
        <p className="text-xs text-red-400">{add.data.error}</p>
      )}
    </div>
  );
}
