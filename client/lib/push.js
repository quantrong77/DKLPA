/** Thông báo đẩy (Web Push) trên thiết bị đang dùng: kiểm tra hỗ trợ, đăng ký service worker /dkct-sw.js, đăng ký nhận tin. */

export const SW_URL = '/dkct-sw.js';
// scope riêng: không đụng service worker khác của trang (ứng dụng chủ); thông báo đẩy không cần trang nằm trong scope
export const SW_SCOPE = '/dkct-push/';

/** Khóa công khai VAPID (base64url) -> Uint8Array cho pushManager.subscribe. */
export function urlBase64ToUint8Array(base64) {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

/**
 * Thiết bị có nhận được thông báo đẩy không. -> { ok, reason }
 * reason: 'insecure' (không phải https), 'ios-install' (iPhone/iPad: phải thêm vào Màn hình chính rồi mở từ đó),
 * 'unsupported' (trình duyệt không hỗ trợ).
 */
export function pushSupport(env = globalThis) {
  const nav = env.navigator || {};
  const ua = String(nav.userAgent || '');
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  const installed = !!(env.matchMedia?.('(display-mode: standalone)')?.matches || nav.standalone);
  if (env.isSecureContext === false) return { ok: false, reason: 'insecure' };
  if (ios && !installed) return { ok: false, reason: 'ios-install' };
  if (!('serviceWorker' in nav) || !env.PushManager || !env.Notification) return { ok: false, reason: 'unsupported' };
  return { ok: true, reason: '' };
}

export const SUPPORT_HINT = {
  insecure: 'Cần mở trang bằng https để nhận thông báo.',
  'ios-install': 'Trên iPhone/iPad: bấm nút Chia sẻ → "Thêm vào MH chính", mở ứng dụng từ biểu tượng trên màn hình chính rồi bật thông báo ở đây (iOS 16.4 trở lên).',
  unsupported: 'Trình duyệt này không hỗ trợ thông báo đẩy. Dùng Chrome, Edge, Firefox hoặc Safari bản mới.'
};

/** Tên gợi ý của thiết bị (hiện trong danh sách thiết bị đã bật). */
export function deviceLabel(ua = globalThis.navigator?.userAgent || '') {
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Thiết bị';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Trình duyệt';
  return `${browser} trên ${os}`;
}

async function activeRegistration() {
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  if (reg.active) return reg;
  const worker = reg.installing || reg.waiting;
  await new Promise((resolve, reject) => {
    if (!worker) { resolve(); return; }
    const timer = setTimeout(() => reject(new Error('Không cài được service worker thông báo.')), 15000);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') { clearTimeout(timer); resolve(); }
      if (worker.state === 'redundant') { clearTimeout(timer); reject(new Error('Không cài được service worker thông báo.')); }
    });
  });
  return reg;
}

/** Đăng ký đang có trên thiết bị này (null nếu chưa bật). */
export async function currentSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Xin quyền, đăng ký nhận tin với khóa VAPID của máy chủ. -> PushSubscription */
export async function subscribeDevice(publicKey) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Trình duyệt đang chặn thông báo của trang này: mở cài đặt trang (biểu tượng ổ khóa cạnh địa chỉ) → Thông báo → Cho phép.'
      : 'Chưa cho phép thông báo.');
  }
  const reg = await activeRegistration();
  const key = urlBase64ToUint8Array(publicKey);
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    // khóa máy chủ đổi: đăng ký lại
    const same = existing.options?.applicationServerKey
      && new Uint8Array(existing.options.applicationServerKey).every((b, i) => b === key[i]);
    if (same) return existing;
    await existing.unsubscribe();
  }
  try {
    return await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch (err) {
    // Chrome ẩn danh: đã cho phép nhưng vẫn từ chối đăng ký
    if (/permission denied/i.test(String(err?.message))) throw new Error('Trình duyệt không cho đăng ký nhận thông báo (cửa sổ ẩn danh không hỗ trợ). Mở trang ở cửa sổ thường rồi bật lại.');
    throw err;
  }
}

// ---- bấm thông báo -> tới các dòng lịch thay đổi --------------------------------------------------------------------
// Service worker mở trang kèm ?dkct-outages=<id>~<YYYY-MM-DD>,… hoặc (trang đang mở) gửi { type: OPEN_MESSAGE, outages }.
// Yêu cầu giữ trong sessionStorage[OPEN_KEY] tới khi màn hình lịch đọc (ứng dụng chủ có thể chưa mở module), rồi phát
// sự kiện OPEN_EVENT trên window. Ứng dụng chủ (ChatLan) làm như vậy để chuyển sang tab module.
export const OPEN_PARAM = 'dkct-outages';
export const OPEN_MESSAGE = 'dkct:open-outages';
export const OPEN_KEY = 'dkct.openOutages';
export const OPEN_EVENT = 'dkct:open-outages';

/** "id~YYYY-MM-DD,…" -> [{ id, day }] (bỏ phần không hợp lệ). */
export function decodeOutages(value) {
  return String(value || '').split(',').map(part => {
    const [id = '', day = ''] = part.split('~');
    return /^[\w-]{1,80}$/.test(id) ? { id, day: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '' } : null;
  }).filter(Boolean);
}

function store(value, env) {
  try { env.sessionStorage.setItem(OPEN_KEY, String(value)); } catch { /* trình duyệt chặn bộ nhớ: bỏ qua */ }
  env.dispatchEvent?.(new env.Event(OPEN_EVENT));
}

/**
 * Nhận yêu cầu mở dòng lịch: tham số ?dkct-outages trên địa chỉ (bỏ khỏi địa chỉ sau khi đọc) và tin của service worker.
 * -> hàm gỡ bộ nghe.
 */
export function receiveOpenRequests(env = globalThis) {
  try {
    const url = new URL(env.location.href);
    const value = url.searchParams.get(OPEN_PARAM);
    if (value) {
      url.searchParams.delete(OPEN_PARAM);
      env.history?.replaceState(env.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      store(value, env);
    }
  } catch { /* không có location */ }
  const sw = env.navigator?.serviceWorker;
  if (!sw?.addEventListener) return () => {};
  const onMessage = (e) => { if (e.data?.type === OPEN_MESSAGE && e.data.outages) store(e.data.outages, env); };
  sw.addEventListener('message', onMessage);
  sw.startMessages?.();
  return () => sw.removeEventListener('message', onMessage);
}

/** Lấy (và xóa) yêu cầu đang chờ: [{ id, day }] | []. */
export function takeOpenRequest(env = globalThis) {
  try {
    const value = env.sessionStorage.getItem(OPEN_KEY);
    if (!value) return [];
    env.sessionStorage.removeItem(OPEN_KEY);
    return decodeOutages(value);
  } catch { return []; }
}
