const SW_VERSION = "2026-04-22-01";
console.log("Service Worker version:", SW_VERSION);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};

  self.registration.showNotification(
    data.title || "Nouveau message",
    {
      body: data.body || "Vous avez reçu un message",
      icon: "/icon-192.png",
      badge: "/badge.png",
      data: {
        url: self.location.origin + "/0000-PQT2026/"
      }
    }
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
