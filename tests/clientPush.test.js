const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../client/lib/push.js');
const env = ({ ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36', standalone = false, secure = true, push = true, touch = 0 } = {}) => ({
  isSecureContext: secure,
  navigator: { userAgent: ua, maxTouchPoints: touch, ...(push ? { serviceWorker: {} } : {}) },
  PushManager: push ? function PushManager() {} : undefined,
  Notification: push ? function Notification() {} : undefined,
  matchMedia: () => ({ matches: standalone })
});
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1';

test('pushSupport: máy tính / Android được; iPhone phải mở từ Màn hình chính; http hoặc trình duyệt cũ thì không', async () => {
  const { pushSupport, SUPPORT_HINT } = await load();
  assert.deepEqual(pushSupport(env()), { ok: true, reason: '' });
  assert.deepEqual(pushSupport(env({ ua: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36' })), { ok: true, reason: '' });
  assert.equal(pushSupport(env({ ua: IPHONE })).reason, 'ios-install');
  assert.equal(pushSupport(env({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.4 Safari/605.1.15', touch: 5 })).reason, 'ios-install', 'iPad giả làm Mac');
  assert.deepEqual(pushSupport(env({ ua: IPHONE, standalone: true })), { ok: true, reason: '' });
  assert.equal(pushSupport(env({ secure: false })).reason, 'insecure');
  assert.equal(pushSupport(env({ push: false })).reason, 'unsupported');
  assert.match(SUPPORT_HINT['ios-install'], /Thêm vào MH chính/);
});

test('urlBase64ToUint8Array / deviceLabel', async () => {
  const { urlBase64ToUint8Array, deviceLabel } = await load();
  const bytes = Buffer.from([0, 255, 62, 63, 1, 2, 3]);
  assert.deepEqual([...urlBase64ToUint8Array(bytes.toString('base64url'))], [...bytes]);
  assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/130.0 Safari/537.36 Edg/130.0'), 'Edge trên Windows');
  assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36'), 'Chrome trên Android');
  assert.equal(deviceLabel(IPHONE), 'Safari trên iPhone/iPad');
});
