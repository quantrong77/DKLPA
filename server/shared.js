/**
 * Gắn module vào một ứng dụng khác (vd ChatLan-cloud) nhưng DÙNG CHUNG dữ liệu với bản độc lập (dkct.onrender.com):
 * cùng CSDL Postgres (Supabase), cùng tài khoản / tổ / vai trò (dkct_app_users, dkct_app_departments — admin quản lý ở
 * trang Quản trị của bản độc lập).
 *
 * - Người dùng của ứng dụng chủ được nhận ra theo EMAIL: email trùng một tài khoản dkct thì làm việc với đúng tài khoản đó
 *   (hồ sơ, quyền như khi đăng nhập dkct.onrender.com). Chưa có tài khoản / chưa được xếp tổ: 403 kèm mã để giao diện hướng dẫn.
 * - Báo lịch cắt điện thay đổi qua ứng dụng chủ: đọc lịch sử thay đổi (dkct_outage_changes) mỗi phút, nên báo được cả khi
 *   bản độc lập là bên tải lịch; người nhận như bản ChatLan (người lập hồ sơ liên quan, trưởng/phó tổ phụ trách), gửi theo email.
 *
 * createSharedDkct({ pool | db, emailOf, notifyByEmail, standaloneUrl, ...deps })
 *  - pool: pg.Pool tới CSDL của bản độc lập (hoặc db đã bọc sẵn)
 *  - emailOf(hostUserId) -> email của người dùng ứng dụng chủ
 *  - notifyByEmail([{ email, text }]) -> gửi tin (ứng dụng chủ tự khớp email -> người dùng)
 * -> { router, migrate(), start(), stop(), accounts }
 */
const express = require('express');
const createDkctModule = require('./index');
const { createPgDb } = require('./pgDb');
const { createAccounts, APP_TABLE_TEXT } = require('./accounts');
const { createOutageImporter } = require('./services/outageImport');
const { changedRows } = require('./util');

const CURSOR = 'notify.host.cursor';
const POLL_MS = 60 * 1000;
const MAX_AGE_MS = 2 * 86400000; // máy chủ ngủ lâu: không báo lại thay đổi quá 2 ngày

/** pg trả TIMESTAMP dạng chuỗi như SQLite / MySQL của module; COUNT(*) -> number. Gọi một lần cho mỗi tiến trình. */
function setupPgTypes(types) {
  types.setTypeParser(1114, (v) => v);
  types.setTypeParser(20, (v) => Number(v));
}

/** Pool Postgres tới CSDL của bản độc lập. */
function createSharedPool(connectionString, { max = 3 } = {}) {
  const { Pool, types } = require('pg');
  setupPgTypes(types);
  const pool = new Pool({
    // Supabase bắt buộc SSL; "?sslmode=disable" cho Postgres chạy thử ở máy
    connectionString, max, ssl: /[?&]sslmode=disable(&|$)/.test(connectionString) ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000, idleTimeoutMillis: 30_000, query_timeout: 120_000
  });
  pool.on('error', (err) => console.error('[dkct] pg:', err.message));
  return pool;
}

function createSharedDkct({ pool, db: givenDb, emailOf, notifyByEmail, standaloneUrl = '', log = console, ...deps }) {
  const db = givenDb || createPgDb(pool, { names: [APP_TABLE_TEXT] });
  const accounts = createAccounts(db);

  /** Báo qua ứng dụng chủ: id tài khoản dkct -> email. */
  async function notifyUsers(messages) {
    if (!notifyByEmail || !messages.length) return;
    const emails = await accounts.emailsOf(messages.map(m => m.userId));
    const out = messages.filter(m => emails.has(m.userId)).map(m => ({ email: emails.get(m.userId), text: m.text }));
    if (out.length) await notifyByEmail(out);
  }

  const dkct = createDkctModule({
    ...deps,
    db,
    getActor: accounts.getUser,
    getProfile: accounts.getUser,
    isAdmin: accounts.isAdmin,
    isDepartmentHead: () => false,
    isUnitLead: accounts.isUnitLead,
    getUnit: accounts.getUnit,
    listDepartments: accounts.listDepartments
    // không truyền notifyUsers: báo qua bộ đọc lịch sử bên dưới (một lần cho mỗi thay đổi, dù tiến trình nào tải lịch)
  });

  // tài khoản dkct của người đang đăng nhập ứng dụng chủ (req.userId của ứng dụng chủ)
  async function linkOf(req) {
    const email = String((await emailOf(req.userId)) || '').trim().toLowerCase();
    const user = email ? await accounts.getUserByEmail(email) : null;
    return { email, user };
  }

  const router = express.Router();
  router.use(express.json({ limit: '2mb' }));
  // Giao diện gọi trước khi mở module: đã có tài khoản dkct cùng email chưa, đã được xếp tổ chưa
  router.get('/link-status', async (req, res, next) => {
    try {
      const { email, user } = await linkOf(req);
      res.json({
        email, standaloneUrl,
        linked: !!user,
        ready: !!user && (user.role === 'admin' || !!user.department),
        user: user ? { fullName: user.fullName, department: user.department, role: user.role } : null
      });
    } catch (err) { next(err); }
  });
  router.use(async (req, res, next) => {
    try {
      const { email, user } = await linkOf(req);
      if (!user) {
        return res.status(403).json({ code: 'DKCT_NOT_LINKED', error: `Chưa có tài khoản Chuẩn bị công tác cho email ${email || '(chưa có email)'}. Đăng ký ở ${standaloneUrl || 'trang Chuẩn bị công tác'} bằng cùng email.` });
      }
      if (user.role !== 'admin' && !user.department) {
        return res.status(403).json({ code: 'DKCT_NO_TEAM', error: 'Tài khoản Chuẩn bị công tác chưa được xếp tổ. Liên hệ quản trị viên.' });
      }
      req.hostUserId = req.userId;
      req.userId = user.id; // từ đây module làm việc với tài khoản dkct
      next();
    } catch (err) { next(err); }
  });
  router.use(dkct.router);

  // ---- báo thay đổi lịch qua ứng dụng chủ, đọc từ lịch sử -----------------------------------------------------------
  const importer = createOutageImporter({ db, notifyUsers, listTeamLeads: accounts.listTeamLeads, log: (m, e) => log.warn?.(m, e?.message || e) });
  async function readCursor() {
    const row = await db.queryOne('SELECT value FROM dkct_settings WHERE name = ?', [CURSOR]);
    return row?.value || null;
  }
  async function writeCursor(value) {
    const res = await db.execute('UPDATE dkct_settings SET value = ?, updatedAt = CURRENT_TIMESTAMP WHERE name = ?', [value, CURSOR]);
    if (!changedRows(res)) await db.execute('INSERT INTO dkct_settings (name, value) VALUES (?, ?)', [CURSOR, value]);
  }
  let polling = false;
  /** Báo các thay đổi mới ghi sau lần trước. Lần chạy đầu chỉ đánh dấu (không báo lại lịch sử cũ). -> số tin đã gửi */
  async function pollChanges(now = new Date()) {
    if (polling) return 0;
    polling = true;
    try {
      const cursor = await readCursor();
      if (!cursor) {
        // id lịch sử bắt đầu bằng thời điểm ghi (LS-<thời gian base36>-…): mốc "bây giờ", lịch sử cũ hơn không báo
        await writeCursor(`LS-${Date.now().toString(36).padStart(9, '0')}`);
        return 0;
      }
      const rows = await db.query(`SELECT id, outageId, kind, note, prevStart, prevEnd, newStart, newEnd, source, changedAt
        FROM dkct_outage_changes WHERE id > ? ORDER BY id DESC LIMIT 500`, [cursor]);
      if (!rows.length) return 0;
      await writeCursor(rows[0].id); // ghi trước: lỗi gửi không làm gửi lặp
      const fresh = rows.reverse().filter(r => !(Date.parse(String(r.changedAt).replace(' ', 'T') + '+07:00') < now.getTime() - MAX_AGE_MS));
      const bySource = new Map();
      for (const r of fresh) {
        if (!bySource.has(r.source)) bySource.set(r.source, []);
        bySource.get(r.source).push(r);
      }
      let sent = 0;
      for (const [source, events] of bySource) {
        const messages = await importer.recipientsOf(events, source);
        if (messages.length) await notifyUsers(messages);
        sent += messages.length;
      }
      return sent;
    } catch (err) {
      log.warn?.(`[dkct] Không báo được thay đổi lịch qua ứng dụng chủ: ${err.message}`);
      return 0;
    } finally {
      polling = false;
    }
  }
  let timer = null;

  return {
    router,
    accounts,
    db,
    migrate: async () => { await accounts.migrate(); await dkct.migrate(); },
    /** Bật tự tải lịch theo giờ hẹn và bộ báo thay đổi. */
    start() {
      dkct.startAutoFetch();
      if (!timer) {
        timer = setInterval(() => { pollChanges().catch(() => {}); }, POLL_MS);
        timer.unref?.();
        setTimeout(() => { pollChanges().catch(() => {}); }, 5000).unref?.();
      }
    },
    stop() { dkct.stopAutoFetch(); if (timer) clearInterval(timer); timer = null; },
    pollChanges,
    autoFetch: dkct.autoFetch
  };
}

module.exports = { createSharedDkct, createSharedPool, setupPgTypes };
