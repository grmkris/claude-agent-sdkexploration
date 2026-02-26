"use client";

import {
  Notification01Icon,
  NotificationOff01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { NotificationSettings } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { usePushNotifications } from "@/hooks/use-push-notifications";

// ─── Individual toggle row ────────────────────────────────────────────────────

function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="scale-75 origin-right"
      />
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
      {children}
    </p>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NotificationSettings() {
  const {
    permission,
    isSubscribed,
    isSupported,
    isLoading,
    subscribe,
    unsubscribe,
    settings,
    updateSettings,
  } = usePushNotifications();

  const toggle = (key: keyof NotificationSettings) => (value: boolean) => {
    void updateSettings({ [key]: value });
  };

  if (!isSupported) {
    return (
      <SidebarGroup>
        <div className="px-2 pb-1 text-[11px] font-medium text-sidebar-foreground/70">
          Notifications
        </div>
        <SidebarGroupContent>
          <p className="px-2 text-[11px] text-muted-foreground">
            Push notifications are not supported in this browser.
          </p>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup>
      <div className="px-2 pb-1 text-[11px] font-medium text-sidebar-foreground/70">
        Notifications
      </div>
      <SidebarGroupContent className="px-2">
        {/* ── Subscribe / Unsubscribe button ── */}
        {permission === "denied" ? (
          <p className="text-[11px] text-muted-foreground">
            Notifications blocked by browser. Open browser site settings to
            re-enable.
          </p>
        ) : (
          <Button
            size="sm"
            variant={isSubscribed ? "outline" : "default"}
            className="w-full h-7 text-[11px] gap-1.5"
            onClick={isSubscribed ? unsubscribe : subscribe}
            disabled={isLoading}
          >
            {isSubscribed ? (
              <>
                <HugeiconsIcon
                  icon={NotificationOff01Icon}
                  size={12}
                  strokeWidth={2}
                />
                Unsubscribe
              </>
            ) : (
              <>
                <HugeiconsIcon
                  icon={Notification01Icon}
                  size={12}
                  strokeWidth={2}
                />
                Enable notifications
              </>
            )}
          </Button>
        )}

        {/* ── Per-event toggles (only when subscribed) ── */}
        {isSubscribed && settings && (
          <div className="mt-2">
            <SectionLabel>Agent sessions</SectionLabel>
            <ToggleRow
              label="Session completed"
              checked={settings.sessionCompleted}
              onChange={toggle("sessionCompleted")}
            />
            <ToggleRow
              label="Session failed"
              checked={settings.sessionFailed}
              onChange={toggle("sessionFailed")}
            />
            <ToggleRow
              label="Needs permission"
              checked={settings.sessionNeedsPermission}
              onChange={toggle("sessionNeedsPermission")}
            />

            <SectionLabel>Deployments</SectionLabel>
            <ToggleRow
              label="Deploy completed"
              checked={settings.deploymentCompleted}
              onChange={toggle("deploymentCompleted")}
            />
            <ToggleRow
              label="Deploy failed"
              checked={settings.deploymentFailed}
              onChange={toggle("deploymentFailed")}
            />

            <SectionLabel>GitHub</SectionLabel>
            <ToggleRow
              label="Push"
              checked={settings.githubPush}
              onChange={toggle("githubPush")}
            />
            <ToggleRow
              label="Pull requests"
              checked={settings.githubPR}
              onChange={toggle("githubPR")}
            />

            <SectionLabel>Scheduled tasks</SectionLabel>
            <ToggleRow
              label="Cron completed"
              checked={settings.cronCompleted}
              onChange={toggle("cronCompleted")}
            />
            <ToggleRow
              label="Cron failed"
              checked={settings.cronFailed}
              onChange={toggle("cronFailed")}
            />

            <SectionLabel>Email</SectionLabel>
            <ToggleRow
              label="Email received"
              checked={settings.emailReceived}
              onChange={toggle("emailReceived")}
            />

            <SectionLabel>Other webhooks</SectionLabel>
            <ToggleRow
              label="Webhook triggered"
              checked={settings.webhookTriggered}
              onChange={toggle("webhookTriggered")}
            />
          </div>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
