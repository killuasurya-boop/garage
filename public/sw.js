self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

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

// Klik notifikasi → fokus tab Garage yang sudah terbuka lalu minta tab itu
// membuka modul tujuan (postMessage), atau buka tab baru bila belum ada.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/os";
  const absolute = new URL(target, self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const samePath = clientList.find((client) => new URL(client.url).pathname === absolute.pathname);
      if (samePath && "focus" in samePath) {
        samePath.postMessage({ type: "garage:navigate", url: absolute.pathname + absolute.search });
        return samePath.focus();
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(absolute.href);
      }
    }),
  );
});
