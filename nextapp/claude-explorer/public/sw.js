// Service Worker — push notifications + installability
// Plain JS, not bundled by Next.js

self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const { title, body, url, tag } = data;

  event.waitUntil(
    self.registration.showNotification(title || "Claude Explorer", {
      body: body || "",
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      tag: tag || undefined,
      data: { url: url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing window if one is open
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Otherwise open a new window
        return clients.openWindow(url);
      })
  );
});
