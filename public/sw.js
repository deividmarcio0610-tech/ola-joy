/* VisionGuard AI — Service Worker de Push Notifications
 * Não faz cache do app shell (Lovable serve HTML com headers de revalidação).
 * Foco: receber Push, exibir notificação, direcionar clique.
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function pickIcon() {
  return "/icon-192.png";
}

function vibrationFor(severity) {
  switch (severity) {
    case "critical":
      return [400, 150, 400, 150, 400, 150, 800];
    case "high":
      return [300, 120, 300, 120, 300];
    case "attention":
      return [200, 100, 200];
    default:
      return [150];
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "VisionGuard AI", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "VisionGuard AI";
  const options = {
    body: data.body || "",
    icon: pickIcon(),
    badge: "/icon-192.png",
    tag: data.tag || "visionguard-alert",
    renotify: true,
    requireInteraction: data.severity === "critical",
    vibrate: vibrationFor(data.severity),
    data: {
      url: data.url || "/intemperies",
      severity: data.severity,
      alertId: data.alertId,
      strikeId: data.strikeId,
      locationId: data.locationId,
      test: !!data.test,
      timestamp: data.timestamp || Date.now(),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const isAppUpdate = data.type === "app-update";
  const targetUrl = data.url || (isAppUpdate ? "/" : "/intemperies");

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            await client.focus();
            if (isAppUpdate) {
              client.postMessage({ type: "apply-app-update" });
              return;
            }
            if ("navigate" in client) {
              try {
                await client.navigate(targetUrl);
              } catch {
                client.postMessage({ type: "navigate", url: targetUrl });
              }
            } else {
              client.postMessage({ type: "navigate", url: targetUrl });
            }
            return;
          }
        } catch {
          // ignore
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "skipWaiting") {
    self.skipWaiting();
  }
});
