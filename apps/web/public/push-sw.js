// SPDX-License-Identifier: AGPL-3.0-only
//
// The part of the website that is awake when no page is open: it shows the
// notifications that arrive, and opens the right page when one is tapped.
// It does nothing else. No page is cached and no request is answered here.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    // A message that cannot be read is still shown, so the browser does not show its own.
  }
  const title = typeof message.title === 'string' && message.title ? message.title : 'New here';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof message.body === 'string' ? message.body : '',
      icon: '/icon.svg',
      image: typeof message.image === 'string' ? message.image : undefined,
      // The same notification sent twice replaces itself.
      tag: typeof message.id === 'string' ? message.id : undefined,
      data: { id: message.id, link: message.link },
    }),
  );
});

/** Only addresses of this website are ever opened. */
function ownPath(link) {
  try {
    const url = new URL(typeof link === 'string' ? link : '/', self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search + url.hash : '/';
  } catch {
    return '/';
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { id, link } = event.notification.data || {};
  const path = ownPath(link);
  const said =
    typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)
      ? fetch(`/v1/viewer/notifications/${id}/opened`, {
          method: 'POST',
          credentials: 'same-origin',
          keepalive: true,
        }).catch(() => undefined)
      : Promise.resolve();
  const shown = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((open) => {
      for (const client of open) {
        if ('focus' in client && 'navigate' in client) {
          return client.focus().then((focused) => (focused || client).navigate(path));
        }
      }
      return self.clients.openWindow(path);
    });
  event.waitUntil(Promise.all([said, shown.catch(() => self.clients.openWindow(path))]));
});
