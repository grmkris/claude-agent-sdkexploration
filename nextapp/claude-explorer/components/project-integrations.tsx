"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { IntegrationWebhooks } from "@/components/integration-webhooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";
import { getTimeAgo } from "@/lib/utils";

function ChevronIcon({
  open,
  className,
}: {
  open: boolean;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""} ${className ?? ""}`}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

// --- Widget display for a single integration ---

export function IntegrationWidgets({
  integrationId,
}: {
  integrationId: string;
}) {
  const { data, isLoading } = useQuery({
    ...orpc.integrations.data.queryOptions({ input: { id: integrationId } }),
    refetchInterval: 60_000,
  });

  if (isLoading)
    return (
      <div className="py-1 text-[10px] text-muted-foreground animate-pulse">
        loading...
      </div>
    );
  if (!data) return null;

  return (
    <div className="flex flex-col gap-2">
      {data.error && (
        <div className="text-[10px] text-red-400">Error: {data.error}</div>
      )}
      {data.widgets.map((widget) => (
        <div key={widget.id}>
          <span className="text-[10px] font-medium text-muted-foreground">
            {widget.title}
          </span>
          {widget.items.length === 0 && (
            <div className="py-0.5 text-[10px] text-muted-foreground italic">
              No items
            </div>
          )}
          <div className="mt-0.5 flex flex-col gap-0.5">
            {widget.items.map((item) => (
              <div
                key={item.id}
                className={`flex items-start gap-1.5 py-0.5 rounded -mx-1 px-1 ${item.url ? "hover:bg-muted/50 cursor-pointer" : ""}`}
                onClick={
                  item.url
                    ? () =>
                        window.open(item.url, "_blank", "noopener,noreferrer")
                    : undefined
                }
              >
                {item.statusColor && (
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.statusColor }}
                  />
                )}
                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                  {/* Row 1: title + secondary link */}
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="truncate text-xs">{item.title}</span>
                    {item.secondaryUrl && item.secondaryLabel && (
                      <a
                        href={item.secondaryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-[10px] text-blue-400 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.secondaryLabel}
                      </a>
                    )}
                  </div>
                  {/* Row 2: subtitle + timestamp */}
                  {(item.subtitle || item.timestamp) && (
                    <div className="flex items-center gap-1">
                      {item.subtitle && (
                        <span className="truncate text-[10px] text-muted-foreground">
                          {item.subtitle}
                        </span>
                      )}
                      {item.timestamp && (
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/80">
                          {getTimeAgo(item.timestamp)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {item.status && !item.statusColor && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {item.status}
                  </Badge>
                )}
                {item.copyValue && (
                  <span onClick={(e) => e.stopPropagation()}>
                    <CopyButton
                      text={item.copyValue}
                      className="hidden sm:block"
                    />
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Add integration form ---

type TestResult = {
  ok: boolean;
  error?: string;
  meta?: {
    userName?: string;
    teams?: { id: string; name: string }[];
    projects?: { id: string; name: string }[];
  };
};

function AddIntegrationForm({
  slug,
  onDone,
}: {
  slug: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<"linear" | "railway" | "github">("linear");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [gitRemoteUrl, setGitRemoteUrl] = useState("");
  const [selectedApiKeyId, setSelectedApiKeyId] = useState("");
  const [saveToVault, setSaveToVault] = useState(true);
  const [vaultLabel, setVaultLabel] = useState("");

  // Vault keys
  const { data: vaultKeys } = useQuery(orpc.apiKeys.list.queryOptions());
  const matchingKeys = vaultKeys?.filter((k) => k.provider === type) ?? [];
  const useVaultKey = selectedApiKeyId !== "";

  // Auto-detect gitRemoteUrl from project
  const { data: projects } = useQuery(orpc.projects.list.queryOptions());
  const project = projects?.find((p) => p.slug === slug);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const config: Record<string, unknown> = {};
      if (type === "github" && (project?.gitRemoteUrl || gitRemoteUrl)) {
        config.gitRemoteUrl = gitRemoteUrl || project?.gitRemoteUrl;
      }
      if (useVaultKey) {
        // Test via vault key
        const result = await client.apiKeys.test({ id: selectedApiKeyId });
        setTestResult(result);
      } else {
        const result = await client.integrations.test({
          type,
          token,
          config: Object.keys(config).length ? config : undefined,
        });
        setTestResult(result);
      }
      if (testResult?.ok !== false && !name) {
        setName(type.charAt(0).toUpperCase() + type.slice(1));
      }
    } catch (e) {
      setTestResult({
        ok: false,
        error: e instanceof Error ? e.message : "Test failed",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const config: Record<string, unknown> = {};
    if (type === "linear" && selectedTeamId) config.teamId = selectedTeamId;
    if (type === "railway" && selectedProjectId)
      config.railwayProjectId = selectedProjectId;
    if (type === "github")
      config.gitRemoteUrl = gitRemoteUrl || project?.gitRemoteUrl;

    let apiKeyId = useVaultKey ? selectedApiKeyId : undefined;

    // Save to vault if requested
    if (!useVaultKey && saveToVault && token) {
      const newKey = await client.apiKeys.create({
        label:
          vaultLabel ||
          `${type.charAt(0).toUpperCase() + type.slice(1)} - ${name || slug}`,
        provider: type,
        token,
      });
      apiKeyId = newKey.id;
      void queryClient.invalidateQueries({
        queryKey: orpc.apiKeys.list.queryOptions().queryKey,
      });
    }

    await client.integrations.create({
      type,
      name: name || type,
      projectSlug: slug,
      ...(apiKeyId ? { apiKeyId } : {}),
      ...(token && !useVaultKey ? { token } : {}),
      config: Object.keys(config).length ? config : undefined,
    });
    void queryClient.invalidateQueries({
      queryKey: orpc.integrations.list.queryOptions().queryKey,
    });
    onDone();
  };

  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex gap-2">
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as typeof type);
            setTestResult(null);
            setSelectedApiKeyId("");
          }}
          className="rounded border bg-background px-2 text-xs"
        >
          <option value="linear">Linear</option>
          <option value="railway">Railway</option>
          <option value="github">GitHub</option>
        </select>

        {matchingKeys.length > 0 ? (
          <select
            value={selectedApiKeyId}
            onChange={(e) => {
              setSelectedApiKeyId(e.target.value);
              setTestResult(null);
            }}
            className="flex-1 rounded border bg-background px-2 text-xs"
          >
            <option value="">Enter new token...</option>
            {matchingKeys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        ) : null}

        {!useVaultKey && (
          <div className="flex flex-1 flex-col gap-0.5">
            <Input
              type="password"
              placeholder={
                type === "github" ? "PAT (optional for public)" : "API token"
              }
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setTestResult(null);
              }}
              className="text-xs"
            />
            <a
              href={
                type === "linear"
                  ? "https://linear.app/settings/api"
                  : type === "railway"
                    ? "https://railway.com/account/tokens"
                    : "https://github.com/settings/tokens/new"
              }
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              {type === "linear"
                ? "Get API key"
                : type === "railway"
                  ? "Get token"
                  : "Get PAT"}{" "}
              &rarr;
            </a>
          </div>
        )}

        <Button
          size="sm"
          onClick={handleTest}
          disabled={testing || (!useVaultKey && !token && type !== "github")}
        >
          {testing ? "..." : "Test"}
        </Button>
      </div>

      {!useVaultKey && token && (
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <input
            type="checkbox"
            checked={saveToVault}
            onChange={(e) => setSaveToVault(e.target.checked)}
            className="h-3 w-3"
          />
          Save to vault
          {saveToVault && (
            <Input
              placeholder="Key label"
              value={vaultLabel}
              onChange={(e) => setVaultLabel(e.target.value)}
              className="ml-1 h-5 w-36 text-[10px]"
            />
          )}
        </label>
      )}

      {type === "github" && !project?.gitRemoteUrl && (
        <Input
          placeholder="https://github.com/owner/repo"
          value={gitRemoteUrl}
          onChange={(e) => setGitRemoteUrl(e.target.value)}
          className="text-xs"
        />
      )}

      {testResult && (
        <div
          className={`text-[10px] ${testResult.ok ? "text-green-400" : "text-red-400"}`}
        >
          {testResult.ok
            ? `Connected${testResult.meta?.userName ? ` as ${testResult.meta.userName}` : ""}`
            : testResult.error}
        </div>
      )}

      {testResult?.ok && (
        <div className="flex gap-2">
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-32 text-xs"
          />
          {type === "linear" &&
            testResult.meta?.teams &&
            testResult.meta.teams.length > 0 && (
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="rounded border bg-background px-2 text-xs"
              >
                <option value="">All teams</option>
                {testResult.meta.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          {type === "railway" &&
            testResult.meta?.projects &&
            testResult.meta.projects.length > 0 && (
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="rounded border bg-background px-2 text-xs"
              >
                <option value="">Select project...</option>
                {testResult.meta.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={type === "railway" && !selectedProjectId}
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

// --- MCP suggestions ---

function IntegrationSuggestions({
  slug,
  onAdd,
}: {
  slug: string;
  onAdd: (type: string) => void;
}) {
  const { data: suggestions } = useQuery({
    ...orpc.integrations.suggest.queryOptions({ input: { slug } }),
    staleTime: 60_000,
  });

  const unconfigured = suggestions?.filter((s) => !s.alreadyConfigured) ?? [];
  if (unconfigured.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {unconfigured.map((s) => (
        <button
          key={s.type}
          onClick={() => onAdd(s.type)}
          className="flex items-center gap-1 rounded border border-dashed px-2 py-0.5 text-[10px] text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <span>+</span>
          <span>{s.reason}</span>
        </button>
      ))}
    </div>
  );
}

// --- Main component ---

export function ProjectIntegrations({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const [showSection, setShowSection] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const { data: allIntegrations } = useQuery({
    ...orpc.integrations.list.queryOptions(),
    refetchInterval: 30_000,
    enabled: showSection || showForm,
  });

  const { data: oauthStatus } = useQuery({
    ...orpc.oauth.status.queryOptions(),
    staleTime: 60_000,
    enabled: showSection,
  });

  const integrations =
    allIntegrations?.filter((i) => i.projectSlug === slug) ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.integrations.list.queryOptions().queryKey,
    });

  const deleteIntegration = useMutation({
    mutationFn: (id: string) => client.integrations.delete({ id }),
    onSuccess: invalidate,
  });

  const toggleIntegration = useMutation({
    mutationFn: (id: string) => client.integrations.toggle({ id }),
    onSuccess: invalidate,
  });

  if (integrations.length === 0 && !showForm) {
    return (
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            Integrations
          </h3>
          <button
            onClick={() => {
              setShowSection(true);
              setShowForm(true);
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            + add
          </button>
        </div>
        <IntegrationSuggestions
          slug={slug}
          onAdd={() => {
            setShowSection(true);
            setShowForm(true);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => setShowSection(!showSection)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronIcon open={showSection} />
          Integrations
          <span className="text-[10px] font-normal">
            ({integrations.length})
          </span>
        </button>
        <button
          onClick={() => {
            setShowSection(true);
            setShowForm(!showForm);
          }}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          {showForm ? "cancel" : "+ add"}
        </button>
      </div>

      {showSection && (
        <>
          {showForm && (
            <AddIntegrationForm
              slug={slug}
              onDone={() => {
                setShowForm(false);
                void invalidate();
              }}
            />
          )}

          {integrations.length > 0 && (
            <div className="flex flex-col gap-3">
              {integrations.map((integration) => (
                <div
                  key={integration.id}
                  className="rounded border px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleIntegration.mutate(integration.id)}
                      className={`h-2.5 w-2.5 shrink-0 rounded-full border ${integration.enabled ? "bg-green-500 border-green-600" : "bg-muted border-muted-foreground/30"}`}
                      title={integration.enabled ? "Disable" : "Enable"}
                    />
                    <span className="shrink-0 text-xs font-medium">
                      {integration.name}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {integration.type}
                    </Badge>
                    {integration.type === "linear" &&
                      oauthStatus?.linear?.configured && (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[10px] border-blue-500/30 text-blue-400"
                        >
                          bot
                        </Badge>
                      )}
                    {(() => {
                      const gitUrl = integration.config?.gitRemoteUrl as
                        | string
                        | undefined;
                      return integration.type === "github" && gitUrl ? (
                        <a
                          href={gitUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-[10px] text-blue-400 hover:underline"
                        >
                          {gitUrl.replace(
                            /^https?:\/\/(www\.)?github\.com\//,
                            ""
                          )}
                        </a>
                      ) : null;
                    })()}
                    {integration.lastError && (
                      <span
                        className="text-[10px] text-red-400"
                        title={integration.lastError}
                      >
                        error
                      </span>
                    )}
                    {integration.lastFetched && (
                      <span className="text-[10px] text-muted-foreground">
                        {getTimeAgo(integration.lastFetched)}
                      </span>
                    )}
                    <div className="flex-1" />
                    <button
                      onClick={() => deleteIntegration.mutate(integration.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
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
                        className="h-3 w-3"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  {integration.enabled && (
                    <div className="mt-1.5">
                      <IntegrationWidgets integrationId={integration.id} />
                      <IntegrationWebhooks
                        integrationId={integration.id}
                        provider={integration.type}
                        projectSlug={slug}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <IntegrationSuggestions slug={slug} onAdd={() => setShowForm(true)} />
        </>
      )}
    </div>
  );
}
