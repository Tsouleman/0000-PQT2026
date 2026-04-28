self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};

  self.registration.showNotification(
    data.title || "Nouveau message",
    {
      body: data.body || "Vous avez reçu un message",
      icon: "/icon-192.png",
      badge: "/badge.png",
      data: {
        url: "/"
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
