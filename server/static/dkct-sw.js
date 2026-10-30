/*
 * Service worker thông báo đẩy của "Chuẩn bị công tác" (lịch cắt điện thay đổi).
 * Ứng dụng chủ phục vụ tại /dkct-sw.js; trang đăng ký với scope /dkct-push/ để không đụng service worker khác của trang.
 */
/* eslint-env serviceworker */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Chuẩn bị công tác';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    tag: data.tag || 'dkct',
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || '/' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const target = new URL(url, self.location.origin);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // đã mở ứng dụng: chỉ đưa lên trước (không chuyển trang: có thể đang soạn dở); chưa mở thì mở trang
    const open = windows.find(c => new URL(c.url).origin === target.origin);
    if (open) return open.focus();
    await self.clients.openWindow(target.href);
  })());
});
