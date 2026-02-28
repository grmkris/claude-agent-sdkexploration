"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const MODELS = [
  { value: "claude-haiku-4-5", label: "Haiku 4.5" },
  { value: "claude-sonnet-4-5", label: "Sonnet 4.5" },
  { value: "claude-opus-4-5", label: "Opus 4.5" },
  { value: "claude-haiku-4-6", label: "Haiku 4.6" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { value: "claude-opus-4-6", label: "Opus 4.6" },
] as const;

export type McpSelection = {
  name: string;
  scope: "user" | "project" | "local";
};

export type ChatSettings = {
  thinkingEnabled: boolean;
  bypassPermissions: boolean;
  planMode: boolean;
  model: string;
  enabledOptionalMcps: McpSelection[];
};

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  thinkingEnabled: false,
  bypassPermissions: true,
  planMode: false,
  model: "claude-opus-4-6",
  enabledOptionalMcps: [],
};

// ---------------------------------------------------------------------------
// Individual mode chip
// ---------------------------------------------------------------------------

function ModeChip({
  active,
  disabled,
  onClick,
  activeClass,
  icon,
  label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  activeClass: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        active
          ? activeClass
          : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// ChatSettingsBar
// ---------------------------------------------------------------------------

export function ChatSettingsBar({
  settings,
  onSettingsChange,
  disabled,
  currentPermissionMode,
  children,
}: {
  settings: ChatSettings;
  onSettingsChange: (settings: ChatSettings) => void;
  disabled?: boolean;
  currentPermissionMode?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col border-t border-border/30">
      {/* Plan mode active banner */}
      {currentPermissionMode === "plan" && (
        <div className="flex items-center gap-1.5 border-b border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400">
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21" />
            <line x1="9" y1="3" x2="9" y2="18" />
            <line x1="15" y1="6" x2="15" y2="21" />
          </svg>
          <span>
            Plan mode active — Claude will explore and propose a plan before
            making any changes
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 px-3 py-1.5 flex-wrap">
        {/* Thinking chip */}
        <ModeChip
          active={settings.thinkingEnabled}
          disabled={disabled}
          onClick={() =>
            onSettingsChange({
              ...settings,
              thinkingEnabled: !settings.thinkingEnabled,
            })
          }
          activeClass="border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400"
          label="Thinking"
          icon={
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.44-4.66z" />
              <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.44-4.66z" />
            </svg>
          }
        />

        {/* Auto-approve chip — disabled when plan mode is on */}
        <ModeChip
          active={settings.bypassPermissions && !settings.planMode}
          disabled={disabled || settings.planMode}
          onClick={() =>
            onSettingsChange({
              ...settings,
              bypassPermissions: !settings.bypassPermissions,
            })
          }
          activeClass="border-green-500/30 bg-green-500/15 text-green-600 dark:text-green-400"
          label="Auto-approve"
          icon={
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              {settings.bypassPermissions && !settings.planMode && (
                <polyline points="9,12 11,14 15,10" />
              )}
            </svg>
          }
        />

        {/* Plan mode chip */}
        <ModeChip
          active={settings.planMode}
          disabled={disabled}
          onClick={() =>
            onSettingsChange({
              ...settings,
              planMode: !settings.planMode,
              // Turning on plan mode disables auto-approve (mutually exclusive)
              bypassPermissions: !settings.planMode
                ? false
                : settings.bypassPermissions,
            })
          }
          activeClass="border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-400"
          label="Plan mode"
          icon={
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21" />
              <line x1="9" y1="3" x2="9" y2="18" />
              <line x1="15" y1="6" x2="15" y2="21" />
            </svg>
          }
        />

        {/* Optional integrations (e.g. MCP selector) */}
        {children}

        {/* Model selector */}
        <div className="ml-auto">
          <Select
            value={settings.model}
            onValueChange={(value) =>
              onSettingsChange({ ...settings, model: value ?? settings.model })
            }
            disabled={disabled}
          >
            <SelectTrigger className="h-6 gap-1 rounded-full border border-transparent bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground shadow-none hover:bg-muted hover:text-foreground focus:ring-0 data-[state=open]:bg-muted data-[state=open]:text-foreground [&>svg]:h-3 [&>svg]:w-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
