self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {});

// Web Push handler — fire notification dari payload yang dikirim server.
// Wired ke setting notificationPushEnabled di /control/settings.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Garage OS", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Garage OS";
  const options = {
    body: data.body || "",
    icon: data.icon || "/garage-brand/logo-icon.png",
    badge: data.badge || "/garage-brand/logo-icon.png",
    tag: data.tag || "garage-notif",
    requireInteraction: Boolean(data.requireInteraction),
    data: {
      url: data.url || "/os",
      ...data.data,
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Click on notification → focus existing tab atau open URL baru.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/os";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(target) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
    }),
  );
});
