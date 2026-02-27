"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type ChatSettings = {
  thinkingEnabled: boolean;
  bypassPermissions: boolean;
};

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  thinkingEnabled: false,
  bypassPermissions: true,
};

export function ChatSettingsBar({
  settings,
  onSettingsChange,
  disabled,
}: {
  settings: ChatSettings;
  onSettingsChange: (settings: ChatSettings) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-5 border-t border-border/30 px-3 py-1.5">
      {/* Thinking toggle */}
      <div className="flex items-center gap-1.5">
        <Switch
          id="thinking-toggle"
          checked={settings.thinkingEnabled}
          onCheckedChange={(checked) =>
            onSettingsChange({ ...settings, thinkingEnabled: checked })
          }
          disabled={disabled}
          className="h-4 w-7 data-[state=checked]:bg-amber-500"
        />
        <Label
          htmlFor="thinking-toggle"
          className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground"
        >
          {/* Brain icon */}
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={settings.thinkingEnabled ? "text-amber-500" : ""}
          >
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.44-4.66z" />
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.44-4.66z" />
          </svg>
          <span
            className={
              settings.thinkingEnabled
                ? "text-amber-600 dark:text-amber-400"
                : ""
            }
          >
            Thinking
          </span>
        </Label>
      </div>

      {/* Permissions toggle */}
      <div className="flex items-center gap-1.5">
        <Switch
          id="permissions-toggle"
          checked={settings.bypassPermissions}
          onCheckedChange={(checked) =>
            onSettingsChange({ ...settings, bypassPermissions: checked })
          }
          disabled={disabled}
          className="h-4 w-7 data-[state=checked]:bg-green-500"
        />
        <Label
          htmlFor="permissions-toggle"
          className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground"
        >
          {/* Shield / checkmark icon */}
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={settings.bypassPermissions ? "text-green-500" : ""}
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            {settings.bypassPermissions && (
              <polyline points="9,12 11,14 15,10" />
            )}
          </svg>
          <span
            className={
              settings.bypassPermissions
                ? "text-green-600 dark:text-green-400"
                : ""
            }
          >
            Auto-approve
          </span>
        </Label>
      </div>
    </div>
  );
}
