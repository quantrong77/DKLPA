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
    data: { url: data.url || '/', outages: data.outages || '' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const target = new URL(data.url || '/', self.location.origin);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // đã mở ứng dụng: không tải lại trang (có thể đang soạn dở) — báo cửa sổ tới các dòng lịch thay đổi rồi đưa lên trước;
    // chưa mở: mở trang kèm ?dkct-outages=… (ứng dụng đọc khi khởi động)
    const open = windows.find(c => new URL(c.url).origin === target.origin);
    if (open) {
      if (data.outages) open.postMessage({ type: 'dkct:open-outages', outages: data.outages });
      return open.focus();
    }
    if (data.outages) target.searchParams.set('dkct-outages', data.outages);
    await self.clients.openWindow(target.href);
  })());
});
