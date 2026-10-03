/**
 * Cấu hình tải lịch cắt điện do admin đặt trên giao diện (Danh mục → Tải lịch tự động), lưu trong dkct_settings.
 *
 * Ưu tiên: cấu hình admin đã lưu > tham số ChatLan truyền vào (deps.outageSource / deps.outageAuto) > biến môi trường
 * (OUTAGE_SOURCE_USER, OUTAGE_SOURCE_PASSWORD, OUTAGE_AUTO_FETCH, OUTAGE_AUTO_DAYS). Ô bỏ trống = dùng .env.
 *
 * Mật khẩu trang lịch được mã hóa AES-256-GCM trước khi lưu, khóa lấy từ DKCT_SECRET_KEY (hoặc deps.secretKey,
 * JWT_SECRET) — không nằm trong CSDL. Không có khóa thì không lưu được mật khẩu (dùng mật khẩu trong .env).
 * Mật khẩu không bao giờ trả về trình duyệt; đổi khóa thì mật khẩu đã lưu không giải mã được, admin nhập lại.
 * Địa chỉ trang lịch (OUTAGE_SOURCE_URL) chỉ đặt trong .env: không để mật khẩu bị gửi tới địa chỉ khác.
 */
const crypto = require('node:crypto');
const { sourceConfig } = require('./outageSource');
const { autoConfig, parseTimes, MAX_DAYS } = require('./outageAutoFetch');
const { changedRows } = require('../util');
const { vnNow } = require('./clock');

const NAME = 'outage.config';
const fail = (status, message) => Object.assign(new Error(message), { status });

function cipherKey(secret) {
  return crypto.createHash('sha256').update(`dkct-outage-source:${secret}`).digest();
}

function encrypt(secret, text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cipherKey(secret), iv);
  const body = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), body]).toString('base64')}`;
}

/** -> mật khẩu, hoặc null nếu không giải mã được (sai khóa / dữ liệu hỏng). */
function decrypt(secret, value) {
  if (!secret || !String(value || '').startsWith('v1:')) return null;
  try {
    const raw = Buffer.from(String(value).slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', cipherKey(secret), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
}

/**
 * @param db
 * @param secret  khóa mã hóa mật khẩu (DKCT_SECRET_KEY …); rỗng = không lưu được mật khẩu
 * @param source  deps.outageSource { url, user, password, fetch } (tùy chọn)
 * @param auto    deps.outageAuto { times, days } (tùy chọn)
 */
function createOutageSettings({ db, secret, source = {}, auto = {} }) {
  let cache = null;

  async function saved() {
    if (cache) return cache;
    const row = await db.queryOne('SELECT value, updatedAt FROM dkct_settings WHERE name = ?', [NAME]);
    let value = {};
    try { value = row?.value ? JSON.parse(row.value) : {}; } catch { value = {}; }
    cache = { ...value, updatedAt: value.updatedAt || row?.updatedAt || null };
    return cache;
  }

  /** Tham số tải lịch (cho fetchOutageWorkbook): tài khoản admin lưu đè lên deps/.env. */
  async function sourceOptions() {
    const s = await saved();
    const password = s.password ? decrypt(secret, s.password) : null;
    return {
      ...(source || {}),
      ...(s.user ? { user: s.user } : {}),
      ...(password ? { password } : {})
    };
  }

  /** Giờ tự tải: admin đã lưu (kể cả để trống = tắt) hay mặc định deps/.env. -> { times: [], days } */
  async function autoOptions() {
    const s = await saved();
    if (s.auto) return autoConfig({ times: s.auto.times || '', days: s.auto.days });
    return autoConfig(auto);
  }

  /** Xem cấu hình (cho admin): không có mật khẩu, chỉ cho biết đã có và lấy từ đâu. */
  async function view() {
    const s = await saved();
    const base = sourceConfig(source);
    const savedPassword = s.password ? decrypt(secret, s.password) : null;
    const envAuto = autoConfig(auto);
    return {
      canStorePassword: !!secret,
      user: s.user || '',
      defaultUser: base.user || '',
      passwordFrom: savedPassword ? 'admin' : base.password ? 'env' : '',
      passwordUnreadable: !!s.password && !savedPassword,
      autoFrom: s.auto ? 'admin' : 'env',
      times: (s.auto ? parseTimes(s.auto.times) : envAuto.times).join(', '),
      days: s.auto ? autoConfig({ days: s.auto.days }).days : envAuto.days,
      defaultTimes: envAuto.times.join(', '),
      defaultDays: envAuto.days,
      maxDays: MAX_DAYS,
      updatedAt: s.updatedAt || null,
      updatedBy: s.updatedBy || null
    };
  }

  /**
   * Lưu cấu hình. input: { user, password (bỏ trống = giữ), clearPassword, times, days, resetAuto }
   */
  async function save(input = {}, actorId) {
    const s = { ...(await saved()) };
    delete s.updatedAt;
    if (input.user !== undefined) {
      const user = String(input.user || '').trim();
      if (user.length > 100) throw fail(400, 'Tên đăng nhập quá dài.');
      if (user) s.user = user; else delete s.user;
    }
    if (input.clearPassword) delete s.password;
    const password = String(input.password || '');
    if (password) {
      if (!secret) throw fail(400, 'Máy chủ chưa có khóa mã hóa (DKCT_SECRET_KEY trong .env) nên không lưu được mật khẩu; đặt mật khẩu trong .env.');
      if (password.length > 200) throw fail(400, 'Mật khẩu quá dài.');
      s.password = encrypt(secret, password);
    }
    if (input.resetAuto) delete s.auto;
    else if (input.times !== undefined || input.days !== undefined) {
      const text = String(input.times ?? s.auto?.times ?? '').trim();
      const times = parseTimes(text);
      if (text && !times.length) throw fail(400, 'Giờ tải không hợp lệ: ghi dạng 07:00, 15:00 (để trống = tắt tự tải).');
      const days = Number.parseInt(input.days ?? s.auto?.days, 10);
      if (input.days !== undefined && input.days !== '' && !(days >= 1 && days <= MAX_DAYS)) throw fail(400, `Số ngày tải từ 1 đến ${MAX_DAYS}.`);
      s.auto = { times: times.join(', '), days: days || autoConfig(auto).days };
    }
    s.updatedBy = actorId || null;
    s.updatedAt = vnNow(); // giờ VN "YYYY-MM-DDTHH:mm…"
    const value = JSON.stringify(s);
    const res = await db.execute('UPDATE dkct_settings SET value = ?, updatedAt = CURRENT_TIMESTAMP WHERE name = ?', [value, NAME]);
    if (!changedRows(res)) await db.execute('INSERT INTO dkct_settings (name, value) VALUES (?, ?)', [NAME, value]);
    cache = null;
    return view();
  }

  return { sourceOptions, autoOptions, view, save, invalidate: () => { cache = null; } };
}

module.exports = { createOutageSettings, encrypt, decrypt };
