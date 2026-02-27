/// <reference lib="webworker" />

// The tsconfig 'dom' lib and the webworker lib both declare 'self' with
// different types, which causes a "Cannot redeclare" conflict if we use
// 'declare const self'. Cast to the correct type instead.
const sw = self as unknown as ServiceWorkerGlobalScope;

// Skip waiting and take control immediately
sw.addEventListener("install", () => {
  sw.skipWaiting();
});

sw.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(sw.clients.claim());
});

// --- Push Notifications ---

interface PushData {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

sw.addEventListener("push", (event: PushEvent) => {
  const data: PushData = event.data?.json() ?? {};

  event.waitUntil(
    sw.registration.showNotification(data.title ?? "Claude Explorer", {
      body: data.body ?? "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      tag: data.tag,
      data: { url: data.url ?? "/" },
    })
  );
});

// --- Notification Click ---

sw.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const url: string = (event.notification.data as { url?: string })?.url ?? "/";

  event.waitUntil(
    sw.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === url && "focus" in client) {
            return (client as WindowClient).focus();
          }
        }
        return sw.clients.openWindow(url);
      })
  );
});

export {};
