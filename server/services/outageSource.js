/**
 * Tải lịch cắt điện từ trang của Công ty (ASP.NET, đăng nhập Basic) như người dùng bấm "Kết xuất file":
 * GET biểu mẫu (lấy __VIEWSTATE…, cookie phiên) -> POST khoảng ngày (dd/mm/yyyy) -> file .xlsx.
 *
 * Cấu hình: admin đặt tài khoản ở Danh mục → Tải lịch tự động (services/outageSettings); mặc định biến môi trường (không commit):
 *   OUTAGE_SOURCE_USER, OUTAGE_SOURCE_PASSWORD   tài khoản trang lịch
 *   OUTAGE_SOURCE_URL                            mặc định trang kết xuất Excel bên dưới
 * Chỉ chạy được khi máy chủ vào được mạng nội bộ Công ty.
 */
const DEFAULT_URL = 'https://home.ptc3.npt.evn.vn/tsvh/lcd.aspx';
const TIMEOUT_MS = 60000;

function sourceConfig(options = {}) {
  const env = process.env;
  return {
    url: options.url || env.OUTAGE_SOURCE_URL || DEFAULT_URL,
    user: options.user ?? env.OUTAGE_SOURCE_USER ?? '',
    password: options.password ?? env.OUTAGE_SOURCE_PASSWORD ?? '',
    fetch: options.fetch || globalThis.fetch
  };
}

const configured = (cfg) => !!(cfg.user && cfg.password);
// 424: lỗi từ trang Công ty (giữ nguyên thông báo cho người dùng; mã 5xx bị ẩn thành lỗi chung)
const fail = (status, message) => Object.assign(new Error(message), { status });

const decodeHtml = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Các ô ẩn của biểu mẫu ASP.NET (name -> value). */
function hiddenFields(html) {
  const out = {};
  for (const tag of html.match(/<input\b[^>]*type="hidden"[^>]*>/gi) || []) {
    const name = (tag.match(/\bname="([^"]*)"/) || [])[1];
    if (name) out[name] = decodeHtml((tag.match(/\bvalue="([^"]*)"/) || [])[1] || '');
  }
  return out;
}
const vnDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

/** Tải file Excel lịch cắt điện cho khoảng [from, to] (YYYY-MM-DD) -> Buffer. */
async function fetchOutageWorkbook({ from, to }, options) {
  const cfg = sourceConfig(options);
  if (!configured(cfg)) throw fail(424, 'Chưa cấu hình tài khoản trang lịch cắt điện: admin vào Danh mục → Tải lịch tự động (hoặc OUTAGE_SOURCE_USER, OUTAGE_SOURCE_PASSWORD trong .env).');
  const headers = { Authorization: `Basic ${Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64')}`, 'User-Agent': 'Mozilla/5.0 (ChuanBiCongTac)' };
  const call = async (init) => {
    try {
      return await cfg.fetch(cfg.url, { ...init, headers: { ...headers, ...(init.headers || {}) }, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      throw fail(424, `Không kết nối được trang lịch cắt điện (${e.cause?.code || e.name || e.message}). Máy chủ cần vào được mạng nội bộ Công ty.`);
    }
  };
  const page = await call({ method: 'GET' });
  if (page.status === 401 || page.status === 403) throw fail(424, 'Trang lịch cắt điện từ chối tài khoản (sai tên đăng nhập/mật khẩu): admin sửa ở Danh mục → Tải lịch tự động.');
  if (!page.ok) throw fail(424, `Trang lịch cắt điện báo lỗi ${page.status}.`);
  const html = await page.text();
  const fields = hiddenFields(html);
  if (!fields.__VIEWSTATE || !/txtTuNgay/.test(html)) throw fail(424, 'Trang lịch cắt điện đã đổi giao diện: không thấy ô "Từ ngày/Đến ngày" để kết xuất file.');
  const cookie = (page.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
  const body = new URLSearchParams({ ...fields, txtTuNgay: vnDate(from), txtDenNgay: vnDate(to), Submit: 'Kết xuất file' });
  const res = await call({ method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { Cookie: cookie } : {}) } });
  if (!res.ok) throw fail(424, `Kết xuất lịch cắt điện báo lỗi ${res.status}.`);
  const type = res.headers.get('content-type') || '';
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!/spreadsheet|excel|octet-stream/i.test(type) && buffer.slice(0, 2).toString('latin1') !== 'PK') {
    throw fail(424, 'Trang lịch cắt điện không trả về file Excel (có thể khoảng ngày không hợp lệ hoặc trang đã đổi).');
  }
  return buffer;
}

module.exports = { fetchOutageWorkbook, sourceConfig, configured, hiddenFields, DEFAULT_URL };
