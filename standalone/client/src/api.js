import { createClient } from '@supabase/supabase-js';

// Địa chỉ Supabase và khóa anon lấy từ server (/api/app/config): build một lần, đổi dự án không cần build lại.
let supabase = null;

export async function initSupabase() {
  if (supabase) return supabase;
  const res = await fetch('/api/app/config');
  const cfg = await res.json();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('Server chưa cấu hình Supabase.');
  supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  return supabase;
}

export const getSupabase = () => supabase;

/** fetch tới API của ứng dụng, tự gắn token đăng nhập (Supabase tự làm mới token khi sắp hết hạn). */
export async function apiFetch(input, init = {}) {
  const headers = new Headers(init.headers || {});
  const { data } = await supabase.auth.getSession();
  if (data?.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) window.dispatchEvent(new Event('dkct:unauthorized'));
  return res;
}

/** Gọi /api/app, trả JSON hoặc ném lỗi có thông điệp của server. */
export async function appApi(path, { method = 'GET', body } = {}) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await apiFetch(`/api/app${path}`, init);
  let payload = null;
  try { payload = await res.json(); } catch { /* không phải JSON */ }
  if (!res.ok) throw Object.assign(new Error(payload?.error || `Lỗi ${res.status}`), { status: res.status });
  return payload;
}

function filenameFromDisposition(disposition) {
  if (!disposition) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8) {
    try { return decodeURIComponent(utf8[1].trim()); } catch { /* dùng tên thường */ }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1].trim() : null;
}

/** Tải tệp cần đăng nhập (vd file Word) — window.open không gửi được token. */
export async function downloadAuthenticatedFile(url, fallbackFilename = 'download') {
  const response = await apiFetch(url);
  if (!response.ok) {
    let message = 'Không thể tải tệp';
    try { message = (await response.json()).error || message; } catch { /* không phải JSON */ }
    throw new Error(message);
  }
  const filename = filenameFromDisposition(response.headers.get('Content-Disposition')) || fallbackFilename;
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
