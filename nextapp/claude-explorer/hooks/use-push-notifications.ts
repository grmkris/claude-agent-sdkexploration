"use client";

import { useCallback, useEffect, useState } from "react";

import type { NotificationSettings } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type PermissionState = "default" | "granted" | "denied" | "unsupported";

interface UsePushNotifications {
  /** Current browser notification permission status */
  permission: PermissionState;
  /** Whether this browser is currently subscribed */
  isSubscribed: boolean;
  /** Whether push notifications are supported in this browser */
  isSupported: boolean;
  /** Whether an async operation is in progress */
  isLoading: boolean;
  /** Subscribe and request permission (idempotent) */
  subscribe: () => Promise<void>;
  /** Unsubscribe and remove the server-side record */
  unsubscribe: () => Promise<void>;
  /** Current notification toggle settings */
  settings: NotificationSettings | null;
  /** Patch one or more settings toggles */
  updateSettings: (patch: Partial<NotificationSettings>) => Promise<void>;
}

// ─── URL-safe base64 → Uint8Array (VAPID key conversion) ─────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePushNotifications(): UsePushNotifications {
  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const [permission, setPermission] = useState<PermissionState>(
    isSupported ? (Notification.permission as PermissionState) : "unsupported"
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);

  // On mount: detect existing subscription + load settings
  useEffect(() => {
    if (!isSupported) return;

    async function init() {
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        setIsSubscribed(!!existing);
      } catch {
        // SW not ready yet — that's fine
      }

      try {
        const res = await fetch("/api/push/settings");
        if (res.ok) setSettings(await res.json());
      } catch {
        // Non-fatal
      }
    }

    void init();
  }, [isSupported]);

  // ── Subscribe ────────────────────────────────────────────────────────────────

  const subscribe = useCallback(async () => {
    if (!isSupported) return;
    setIsLoading(true);
    try {
      // 1. Get VAPID public key
      const keyRes = await fetch("/api/push/vapid-key");
      if (!keyRes.ok)
        throw new Error("Push notifications not configured on server");
      const { publicKey } = (await keyRes.json()) as { publicKey: string };

      // 2. Request notification permission
      const perm = await Notification.requestPermission();
      setPermission(perm as PermissionState);
      if (perm !== "granted") return;

      // 3. Wait for service worker + subscribe
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
          .buffer as ArrayBuffer,
      });

      // 4. Send subscription to server
      const subJson = sub.toJSON() as {
        endpoint: string;
        keys?: { p256dh: string; auth: string };
      };
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
          userAgent: navigator.userAgent,
        }),
      });

      setIsSubscribed(true);
    } catch (err) {
      console.error("[push] subscribe error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  // ── Unsubscribe ──────────────────────────────────────────────────────────────

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error("[push] unsubscribe error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  // ── Update settings ──────────────────────────────────────────────────────────

  const updateSettings = useCallback(
    async (patch: Partial<NotificationSettings>) => {
      try {
        const res = await fetch("/api/push/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.ok) setSettings(await res.json());
      } catch (err) {
        console.error("[push] updateSettings error:", err);
      }
    },
    []
  );

  return {
    permission,
    isSubscribed,
    isSupported,
    isLoading,
    subscribe,
    unsubscribe,
    settings,
    updateSettings,
  };
}
