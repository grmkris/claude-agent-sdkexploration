"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";
import { client } from "@/lib/orpc-client";

export function BotIdentitySetup() {
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useQuery({
    ...orpc.oauth.status.queryOptions(),
    refetchInterval: 30_000,
  });

  const [showSetup, setShowSetup] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    botName?: string;
    error?: string;
  } | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.oauth.status.queryOptions().queryKey,
    });

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      const res = await client.oauth.saveCredentials({
        provider: "linear",
        clientId,
        clientSecret,
      });
      setResult(res);
      if (res.ok) {
        setClientId("");
        setClientSecret("");
        setShowSetup(false);
        invalidate();
      }
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : "Failed",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    await client.oauth.removeCredentials({ provider: "linear" });
    invalidate();
  };

  if (isLoading) return null;

  const linear = status?.linear;
  const isConfigured = linear?.configured;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Bot Identity</CardTitle>
          <Badge variant={isConfigured ? "default" : "outline"}>
            {isConfigured ? "Active" : "Not configured"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isConfigured ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Linear actions appear as{" "}
              <span className="font-medium text-foreground">
                {linear?.botName || "your OAuth app"}
              </span>
              {linear?.source === "env" && (
                <span className="text-[10px] text-muted-foreground ml-1">
                  (via env vars)
                </span>
              )}
            </p>
            {linear?.source === "store" && (
              <Button
                size="sm"
                variant="ghost"
                className="w-fit text-xs"
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-3">
              Create a Linear OAuth app so actions (issue creation, comments,
              status changes) appear as a bot instead of your personal account.
            </p>

            {!showSetup ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowSetup(true)}
              >
                Set Up Bot Identity
              </Button>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="text-xs text-muted-foreground flex flex-col gap-1">
                  <p className="font-medium text-foreground">Setup steps:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>
                      Go to{" "}
                      <a
                        href="https://linear.app/settings/api/applications/new"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline"
                      >
                        Linear &rarr; Settings &rarr; API &rarr; Applications &rarr; New
                      </a>
                    </li>
                    <li>
                      Set app name (this becomes the bot&apos;s display name)
                    </li>
                    <li>Upload an icon for the bot</li>
                    <li>
                      Enable the{" "}
                      <span className="font-medium text-foreground">
                        Client Credentials
                      </span>{" "}
                      toggle
                    </li>
                    <li>Copy Client ID and Client Secret below</li>
                  </ol>
                </div>
                <div className="flex flex-col gap-2">
                  <Input
                    placeholder="Client ID"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="text-sm"
                  />
                  <Input
                    type="password"
                    placeholder="Client Secret"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    className="text-sm"
                  />
                </div>
                {result && (
                  <p
                    className={`text-xs ${result.ok ? "text-green-400" : "text-red-400"}`}
                  >
                    {result.ok
                      ? `Connected as ${result.botName || "bot"}`
                      : result.error}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!clientId || !clientSecret || saving}
                    onClick={handleSave}
                  >
                    {saving ? "Testing..." : "Test & Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowSetup(false);
                      setResult(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
