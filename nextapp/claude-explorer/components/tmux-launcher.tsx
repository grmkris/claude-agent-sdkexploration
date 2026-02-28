"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { orpc } from "@/lib/orpc";
import {
  generateSshCommand,
  generateTmuxCommand,
  type TmuxLayout,
} from "@/lib/tmux-command";
import { cn } from "@/lib/utils";

// ── Inline icons ──────────────────────────────────────────────────────────────

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LAYOUTS: { value: TmuxLayout; label: string }[] = [
  { value: "even-horizontal", label: "Side by side" },
  { value: "even-vertical", label: "Stacked" },
  { value: "tiled", label: "Grid 2×2" },
  { value: "main-vertical", label: "Main + side" },
];

const MODELS = [
  { value: "", label: "Default" },
  { value: "claude-opus-4-5", label: "Opus" },
  { value: "claude-sonnet-4-5", label: "Sonnet" },
  { value: "claude-haiku-4-5", label: "Haiku" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function TmuxLauncher({
  slug,
  projectPath,
}: {
  slug: string;
  projectPath: string | null;
}) {
  const [panelCount, setPanelCount] = useState<1 | 2 | 3 | 4>(1);
  const [layout, setLayout] = useState<TmuxLayout>("even-horizontal");
  const [resumeIds, setResumeIds] = useState<(string | null)[]>([null]);
  const [skipPermissions, setSkipPermissions] = useState(false);
  const [ccMode, setCcMode] = useState(false);
  const [model, setModel] = useState("");
  const [sshTarget, setSshTarget] = useState("");
  const [tmuxEnabled, setTmuxEnabled] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: serverConfig } = useQuery(orpc.server.config.queryOptions());
  const { data: sessions } = useQuery(
    orpc.sessions.list.queryOptions({ input: { slug } })
  );

  // Auto-fill SSH target from server config (only on first load; user can override)
  useEffect(() => {
    const host = serverConfig?.sshHost;
    if (host) {
      setSshTarget((prev) => prev || host);
    }
  }, [serverConfig?.sshHost]);

  // Keep resumeIds in sync with panelCount (grow or shrink)
  const handlePanelCount = (n: 1 | 2 | 3 | 4) => {
    setPanelCount(n);
    setResumeIds((prev) => {
      const next = [...prev];
      while (next.length < n) next.push(null);
      return next.slice(0, n);
    });
  };

  const setResumeId = (index: number, value: string | null) => {
    setResumeIds((prev) => {
      const next = [...prev];
      next[index] = value === "new" || value === null ? null : value;
      return next;
    });
  };

  const sessionName = `claude-${slug.slice(0, 8)}`;
  const command = projectPath
    ? tmuxEnabled
      ? generateTmuxCommand({
          sessionName,
          projectPath,
          panelCount,
          layout,
          resumeSessionIds: resumeIds,
          skipPermissions,
          model: model || undefined,
          sshTarget: sshTarget || undefined,
          ccMode,
        })
      : generateSshCommand({
          projectPath,
          sshTarget: sshTarget || undefined,
        })
    : null;

  const handleCopy = () => {
    if (!command) return;
    void navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* ── SSH target (always visible) ── */}
      <div className="flex items-center gap-1.5">
        <span className="w-10 shrink-0 text-[10px] text-muted-foreground">
          SSH
        </span>
        <input
          type="text"
          value={sshTarget}
          onChange={(e) => setSshTarget(e.target.value)}
          placeholder="user@host"
          className="h-6 flex-1 rounded bg-muted/50 px-1.5 font-mono text-[10px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* ── Tmux enhancement toggle ── */}
      <div className="flex items-center gap-1.5">
        <label className="flex cursor-pointer items-center gap-1">
          <input
            type="checkbox"
            checked={tmuxEnabled}
            onChange={(e) => setTmuxEnabled(e.target.checked)}
            className="h-3 w-3 accent-primary"
          />
          <span className="text-[10px] text-muted-foreground">
            Use tmux session
          </span>
        </label>
      </div>

      {/* ── Tmux options (only when tmux is enabled) ── */}
      {tmuxEnabled && (
        <>
          {/* ── Panels + -CC toggle ── */}
          <div className="flex items-center gap-1.5">
            <span className="w-10 shrink-0 text-[10px] text-muted-foreground">
              Panels
            </span>
            <div className="flex flex-1 gap-0.5">
              {([1, 2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => handlePanelCount(n)}
                  className={cn(
                    "h-6 w-6 rounded text-[10px] font-mono transition-colors",
                    panelCount === n
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            {/* -CC checkbox: iTerm2 integration mode */}
            <label
              className="flex cursor-pointer items-center gap-1"
              title="tmux -CC (iTerm2 integration)"
            >
              <input
                type="checkbox"
                checked={ccMode}
                onChange={(e) => setCcMode(e.target.checked)}
                className="h-3 w-3 accent-primary"
              />
              <span className="text-[10px] text-muted-foreground">-CC</span>
            </label>
          </div>

          {/* ── Layout (only when panelCount > 1) ── */}
          {panelCount > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="w-10 shrink-0 text-[10px] text-muted-foreground">
                Layout
              </span>
              <Select
                value={layout}
                onValueChange={(v) =>
                  setLayout((v ?? "even-horizontal") as TmuxLayout)
                }
              >
                <SelectTrigger size="sm" className="h-6 flex-1 text-[10px]">
                  <SelectValue>
                    {LAYOUTS.find((l) => l.value === layout)?.label ?? layout}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LAYOUTS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Per-pane resume session selectors ── */}
          {Array.from({ length: panelCount }).map((_, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-10 shrink-0 text-[10px] text-muted-foreground">
                {panelCount > 1 ? `Pane ${i + 1}` : "Resume"}
              </span>
              <Select
                value={resumeIds[i] ?? "new"}
                onValueChange={(v) => setResumeId(i, v)}
              >
                <SelectTrigger size="sm" className="h-6 flex-1 text-[10px]">
                  <SelectValue>
                    {(() => {
                      const id = resumeIds[i];
                      if (!id) return "new session";
                      const s = sessions?.find((s) => s.id === id);
                      if (!s) return id.slice(0, 8);
                      return s.firstPrompt
                        ? s.firstPrompt.slice(0, 24)
                        : s.id.slice(0, 8);
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">new session</SelectItem>
                  {sessions && sessions.length > 0 && <SelectSeparator />}
                  {sessions?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="font-mono">{s.id.slice(0, 8)}</span>
                      {s.firstPrompt && (
                        <span className="ml-1 text-muted-foreground">
                          {s.firstPrompt.slice(0, 22)}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}

          {/* ── Flags row: skip-permissions + model ── */}
          <div className="flex items-center gap-1.5">
            <span className="w-10 shrink-0 text-[10px] text-muted-foreground">
              Flags
            </span>
            <label className="flex cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                checked={skipPermissions}
                onChange={(e) => setSkipPermissions(e.target.checked)}
                className="h-3 w-3 accent-primary"
              />
              <span className="text-[10px] text-foreground">skip-perms</span>
            </label>
            <div className="ml-auto">
              <Select value={model} onValueChange={(v) => setModel(v ?? "")}>
                <SelectTrigger size="sm" className="h-6 w-24 text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      {/* ── Command preview ── */}
      {command ? (
        <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted/50 px-2 py-1.5 font-mono text-[9px] leading-relaxed text-muted-foreground">
          {command}
        </pre>
      ) : (
        <div className="rounded bg-muted/30 px-2 py-1.5 text-[10px] text-muted-foreground/50">
          No project path — set one in project settings
        </div>
      )}

      {/* ── Copy button ── */}
      <button
        onClick={handleCopy}
        disabled={!command}
        className={cn(
          "flex h-7 items-center justify-center gap-1.5 rounded text-[10px] font-medium transition-colors",
          command
            ? "bg-muted text-foreground hover:bg-muted/80"
            : "cursor-not-allowed bg-muted/30 text-muted-foreground/40"
        )}
      >
        {copied ? (
          <>
            <CheckIcon className="h-3 w-3 text-green-400" />
            Copied!
          </>
        ) : (
          <>
            <CopyIcon className="h-3 w-3" />
            Copy command
          </>
        )}
      </button>
    </div>
  );
}
