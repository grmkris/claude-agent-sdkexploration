"use client";

import { useCallback, useEffect, useState } from "react";

import { subscribePush, unsubscribePush } from "@/app/actions/push";

type Status =
  | "unsupported"
  | "loading"
  | "subscribed"
  | "unsubscribed"
  | "denied";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

export function PushNotificationManager() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !vapidPublicKey
    ) {
      setStatus("unsupported");
      return;
    }

    // Register SW + check existing subscription
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) =>
        (
          reg as unknown as { pushManager: PushManager }
        ).pushManager.getSubscription()
      )
      .then((sub) => {
        setStatus(sub ? "subscribed" : "unsubscribed");
      })
      .catch(() => setStatus("unsupported"));
  }, []);

  const handleSubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const pm = (reg as unknown as { pushManager: PushManager }).pushManager;
      const sub = await pm.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          vapidPublicKey!
        ) as BufferSource,
      });

      const json = sub.toJSON();
      await subscribePush({
        endpoint: json.endpoint!,
        keys: {
          p256dh: json.keys!.p256dh!,
          auth: json.keys!.auth!,
        },
      });
      setStatus("subscribed");
    } catch {
      // User denied permission or other error
      if (Notification.permission === "denied") {
        setStatus("denied");
      }
    }
  }, []);

  const handleUnsubscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const pm = (reg as unknown as { pushManager: PushManager }).pushManager;
      const sub = await pm.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await unsubscribePush(sub.endpoint);
      }
      setStatus("unsubscribed");
    } catch {
      // ignore
    }
  }, []);

  if (status === "unsupported" || status === "loading") return null;

  return (
    <div className="flex items-center gap-2 text-xs">
      {status === "denied" && (
        <span className="text-muted-foreground">Notifications blocked</span>
      )}
      {status === "unsubscribed" && (
        <button
          type="button"
          onClick={handleSubscribe}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Enable notifications
        </button>
      )}
      {status === "subscribed" && (
        <button
          type="button"
          onClick={handleUnsubscribe}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Disable notifications
        </button>
      )}
    </div>
  );
}
