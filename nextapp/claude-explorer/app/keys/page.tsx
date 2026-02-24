"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { BotIdentitySetup } from "@/components/bot-identity-setup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { getTimeAgo } from "@/lib/utils";

const PROVIDERS = [
  { label: "Anthropic", value: "anthropic" },
  { label: "Linear", value: "linear" },
  { label: "GitHub", value: "github" },
  { label: "Railway", value: "railway" },
  { label: "Other", value: "other" },
] as const;

type Provider = (typeof PROVIDERS)[number]["value"];

const PROVIDER_LINKS: Record<string, string> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  linear: "https://linear.app/settings/api",
  railway: "https://railway.com/account/tokens",
  github: "https://github.com/settings/tokens/new",
};

export default function KeysPage() {
  const queryClient = useQueryClient();
  const { data: keys, isLoading } = useQuery({
    ...orpc.apiKeys.list.queryOptions(),
    refetchInterval: 30000,
  });
  const { data: usage } = useQuery(orpc.apiKeys.usage.queryOptions());

  const [label, setLabel] = useState("");
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [token, setToken] = useState("");
  const [showForm, setShowForm] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: orpc.apiKeys.list.queryOptions().queryKey,
    });
    void queryClient.invalidateQueries({
      queryKey: orpc.apiKeys.usage.queryOptions().queryKey,
    });
  };

  const createKey = useMutation({
    mutationFn: () =>
      client.apiKeys.create({
        label,
        provider,
        token,
      }),
    onSuccess: () => {
      invalidate();
      setLabel("");
      setProvider("anthropic");
      setToken("");
      setShowForm(false);
    },
  });

  const deleteKey = useMutation({
    mutationFn: (id: string) => client.apiKeys.delete({ id }),
    onSuccess: invalidate,
  });

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    ok: boolean;
    error?: string;
  } | null>(null);

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const result = await client.apiKeys.test({ id });
      setTestResult({ id, ok: result.ok, error: result.error });
    } catch (e) {
      setTestResult({
        id,
        ok: false,
        error: e instanceof Error ? e.message : "Test failed",
      });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="p-4">
      <div className="mb-6">
        <BotIdentitySetup />
      </div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold">API Keys</h1>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            + Add Key
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Add API Key</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as Provider)}
                  className="rounded border bg-background px-2 text-sm"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Label (e.g. Work Linear, Personal GitHub)"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="flex-1"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Input
                  type="password"
                  placeholder="API token / key"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
                {PROVIDER_LINKS[provider] && (
                  <a
                    href={PROVIDER_LINKS[provider]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Get {PROVIDERS.find((p) => p.value === provider)?.label} key
                    &rarr;
                  </a>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!label || !token || createKey.isPending}
                  onClick={() => createKey.mutate()}
                >
                  {createKey.isPending ? "Saving..." : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowForm(false);
                    setLabel("");
                    setToken("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !keys || keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No API keys saved. Add a key to reuse it across projects.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {keys.map((key) => (
            <Card key={key.id} size="sm">
              <CardContent className="flex items-center gap-3 py-3">
                <span className="shrink-0 text-sm font-medium">
                  {key.label}
                </span>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {key.provider}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {getTimeAgo(key.createdAt)}
                </span>
                {usage && usage[key.id] ? (
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {usage[key.id]} integration{usage[key.id] > 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    unused
                  </span>
                )}
                {testResult?.id === key.id && (
                  <span
                    className={`text-[10px] ${testResult.ok ? "text-green-400" : "text-red-400"}`}
                  >
                    {testResult.ok ? "Connected" : testResult.error}
                  </span>
                )}
                <div className="flex-1" />
                <button
                  onClick={() => handleTest(key.id)}
                  disabled={testingId === key.id}
                  className="shrink-0 rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  {testingId === key.id ? "..." : "Test"}
                </button>
                <button
                  onClick={() => deleteKey.mutate(key.id)}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                  title="Delete"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
