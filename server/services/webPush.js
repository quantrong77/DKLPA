/**
 * Thông báo đẩy (Web Push) tới máy tính / điện thoại khi lịch cắt điện thay đổi.
 *
 * - Khóa VAPID sinh một lần, lưu trong dkct_settings ('push.vapid'): bản độc lập và ChatLan-cloud dùng chung CSDL nên
 *   cùng khóa; thiết bị đăng ký ở bên nào cũng nhận được tin do bên nào gửi.
 * - Mỗi thiết bị (trình duyệt) một dòng dkct_push_subscriptions; scope 'team': thay đổi của tổ người đăng ký,
 *   'all': mọi thay đổi. Gửi từ tiến trình nạp lịch (cùng chỗ báo Zalo) nên mỗi thay đổi gửi một lần.
 * - Thiết bị đã hủy (404/410 từ dịch vụ đẩy) thì xóa; lỗi khác đếm, quá MAX_FAILS lần liên tiếp thì xóa.
 */
const crypto = require('node:crypto');
const webpush = require('web-push');
const { newId } = require('../schema');
const { changedRows } = require('../util');

const KEYS = 'push.vapid';
const SCOPES = ['team', 'all'];
const MAX_FAILS = 20;
const MAX_BODY = 900; // payload Web Push tối đa ~4 KB (sau mã hóa); thân tin ngắn để hiện đủ trên điện thoại
const TTL_SECONDS = 12 * 3600;
const B64URL = /^[A-Za-z0-9_-]+=*$/;

const fail = (status, message) => Object.assign(new Error(message), { status });
const hashOf = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex');
const nowText = (d = new Date()) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 16); // giờ Việt Nam

/** Kiểm tra đăng ký từ trình duyệt (PushSubscription.toJSON()). */
function cleanSubscription(input) {
  const endpoint = String(input?.endpoint || '');
  let url;
  try { url = new URL(endpoint); } catch { throw fail(400, 'Đăng ký thông báo không hợp lệ.'); }
  if (url.protocol !== 'https:' || endpoint.length > 2000) throw fail(400, 'Đăng ký thông báo không hợp lệ.');
  const p256dh = String(input?.keys?.p256dh || '');
  const auth = String(input?.keys?.auth || '');
  if (!B64URL.test(p256dh) || p256dh.length > 200 || !B64URL.test(auth) || auth.length > 100) throw fail(400, 'Đăng ký thông báo không hợp lệ.');
  return { endpoint, p256dh, auth };
}

/** Trang mở khi bấm thông báo: chỉ http(s), mặc định '/'. */
function cleanOpenUrl(value) {
  try {
    const u = new URL(String(value || ''));
    return ['http:', 'https:'].includes(u.protocol) ? u.href.slice(0, 1000) : '';
  } catch { return ''; }
}

/**
 * Nội dung thông báo cho một thiết bị: các dòng thay đổi thuộc tổ (department rỗng = mọi tổ). -> null nếu không có gì.
 * described: [{ line, teams }] (importer.describeEvents).
 */
function notificationFor(described, { department = '', openUrl = '' } = {}) {
  const lines = described.filter(d => !department || d.teams.includes(department)).map(d => d.line);
  if (!lines.length) return null;
  let body = '';
  let shown = 0;
  for (const line of lines) {
    const next = body ? `${body}\n${line}` : line;
    if (next.length > MAX_BODY && shown) break;
    body = next.slice(0, MAX_BODY);
    shown += 1;
  }
  if (shown < lines.length) body += `\n… và ${lines.length - shown} thay đổi khác.`;
  return {
    title: `⚡ Lịch cắt điện thay đổi: ${lines.length} mục${department ? ` — ${department}` : ''}`,
    body,
    url: openUrl || '/',
    tag: 'dkct-outage-change'
  };
}

/**
 * @param db
 * @param subject  VAPID subject (mailto: hoặc https:); mặc định DKCT_PUSH_SUBJECT hoặc trang bản độc lập
 * @param send     (subscription, payload, options) -> Promise (thử nghiệm: thay web-push)
 */
function createWebPush({ db, subject = process.env.DKCT_PUSH_SUBJECT || 'https://dkct.onrender.com', send = webpush.sendNotification, generateKeys = webpush.generateVAPIDKeys, log = console }) {
  let keysPromise = null;

  async function readKeys() {
    const row = await db.queryOne('SELECT value FROM dkct_settings WHERE name = ?', [KEYS]);
    try {
      const v = row?.value ? JSON.parse(row.value) : null;
      return v?.publicKey && v?.privateKey ? v : null;
    } catch { return null; }
  }
  /** Khóa VAPID dùng chung: đọc, chưa có thì sinh và lưu (hai máy chủ cùng sinh: giữ khóa lưu trước). */
  function keys() {
    keysPromise = keysPromise || (async () => {
      const saved = await readKeys();
      if (saved) return saved;
      const fresh = generateKeys();
      try {
        await db.execute('INSERT INTO dkct_settings (name, value) VALUES (?, ?)', [KEYS, JSON.stringify(fresh)]);
      } catch { /* máy chủ kia vừa lưu */ }
      return (await readKeys()) || fresh;
    })().catch((err) => { keysPromise = null; throw err; });
    return keysPromise;
  }

  async function publicKey() {
    return (await keys()).publicKey;
  }

  const columns = 'id, scope, label, department, failCount, lastSentAt, createdAt, endpointHash';
  /** Thiết bị đã bật của người dùng; current: thiết bị có endpoint này (trình duyệt đang dùng). */
  async function devicesOf(userId, endpoint = '') {
    const mine = endpoint ? hashOf(String(endpoint)) : '';
    const rows = await db.query(`SELECT ${columns} FROM dkct_push_subscriptions WHERE userId = ? ORDER BY createdAt`, [userId]);
    return rows.map(({ endpointHash, ...r }) => ({ ...r, current: !!mine && endpointHash === mine }));
  }

  /** Đăng ký / cập nhật thiết bị cho người dùng (thiết bị đã đăng ký cho người khác thì chuyển sang người này). */
  async function subscribe(actor, { subscription, scope, label, openUrl } = {}) {
    const sub = cleanSubscription(subscription);
    const s = SCOPES.includes(scope) ? scope : 'team';
    const hash = hashOf(sub.endpoint);
    const values = [actor.id, actor.department || '', s, sub.endpoint, sub.p256dh, sub.auth, String(label || '').slice(0, 255), cleanOpenUrl(openUrl)];
    const res = await db.execute(`UPDATE dkct_push_subscriptions SET userId = ?, department = ?, scope = ?, endpoint = ?, p256dh = ?, auth = ?,
      label = ?, openUrl = ?, failCount = 0, updatedAt = CURRENT_TIMESTAMP WHERE endpointHash = ?`, [...values, hash]);
    if (!changedRows(res)) {
      await db.execute(`INSERT INTO dkct_push_subscriptions (id, userId, department, scope, endpoint, p256dh, auth, label, openUrl, endpointHash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [newId('PU'), ...values, hash]);
    }
    return (await devicesOf(actor.id, sub.endpoint)).find(d => d.current);
  }

  /** Hủy thiết bị đang dùng (theo endpoint) của người dùng. */
  async function unsubscribe(actor, endpoint) {
    await db.execute('DELETE FROM dkct_push_subscriptions WHERE endpointHash = ? AND userId = ?', [hashOf(String(endpoint || '')), actor.id]);
  }

  /** Xóa một thiết bị trong danh sách của người dùng. */
  async function remove(actor, id) {
    await db.execute('DELETE FROM dkct_push_subscriptions WHERE id = ? AND userId = ?', [String(id), actor.id]);
  }

  /** Gửi một tin tới một thiết bị; thiết bị hủy thì xóa. -> true nếu gửi được. */
  async function deliver(row, payload, vapid) {
    try {
      await send({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify(payload),
        { vapidDetails: { subject, ...vapid }, TTL: TTL_SECONDS, urgency: 'high' });
      await db.execute('UPDATE dkct_push_subscriptions SET failCount = 0, lastSentAt = ? WHERE id = ?', [nowText(), row.id]);
      return true;
    } catch (err) {
      const gone = err?.statusCode === 404 || err?.statusCode === 410;
      if (gone || Number(row.failCount) + 1 >= MAX_FAILS) {
        await db.execute('DELETE FROM dkct_push_subscriptions WHERE id = ?', [row.id]);
      } else {
        await db.execute('UPDATE dkct_push_subscriptions SET failCount = failCount + 1 WHERE id = ?', [row.id]);
        log.warn?.(`[dkct] Không gửi được thông báo đẩy (${err?.statusCode || err?.message}).`);
      }
      return false;
    }
  }

  async function deliverAll(jobs) {
    if (!jobs.length) return 0;
    const vapid = await keys();
    let sent = 0;
    for (let i = 0; i < jobs.length; i += 10) {
      const done = await Promise.all(jobs.slice(i, i + 10).map(([row, payload]) => deliver(row, payload, { publicKey: vapid.publicKey, privateKey: vapid.privateKey })));
      sent += done.filter(Boolean).length;
    }
    return sent;
  }

  /** Thử: gửi tới các thiết bị của người dùng. -> { sent, total } */
  async function test(actor) {
    const rows = await db.query('SELECT * FROM dkct_push_subscriptions WHERE userId = ?', [actor.id]);
    if (!rows.length) throw fail(400, 'Thiết bị này chưa bật thông báo.');
    const sent = await deliverAll(rows.map(r => [r, {
      title: '✅ Thử thông báo lịch cắt điện',
      body: `Thiết bị này sẽ nhận thông báo khi lịch cắt điện ${r.scope === 'all' ? 'thay đổi' : `của ${r.department || 'tổ'} thay đổi`}.`,
      url: r.openUrl || '/', tag: 'dkct-test'
    }]));
    return { sent, total: rows.length };
  }

  /**
   * Sau khi nạp lịch có thay đổi (cùng chỗ báo Zalo). -> số thiết bị đã gửi. Không ném lỗi.
   * describe: importer.describeEvents.
   */
  async function onChanges(events, { describe }) {
    try {
      if (!events?.length) return 0;
      const rows = await db.query('SELECT * FROM dkct_push_subscriptions');
      if (!rows.length) return 0;
      const described = await describe(events);
      const jobs = rows
        .map(r => [r, notificationFor(described, { department: r.scope === 'all' ? '' : r.department, openUrl: r.openUrl })])
        .filter(([, payload]) => payload);
      return await deliverAll(jobs);
    } catch (err) {
      log.warn?.(`[dkct] Không gửi được thông báo đẩy: ${err.message}`);
      return 0;
    }
  }

  return { publicKey, devicesOf, subscribe, unsubscribe, remove, test, onChanges };
}

module.exports = { createWebPush, notificationFor, cleanSubscription, SCOPES };
