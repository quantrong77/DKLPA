/**
 * Ứng dụng Chuẩn bị công tác chạy độc lập (không cần ChatLan):
 *  - đăng nhập bằng Supabase Auth (email + mật khẩu); server chỉ tin token đã được Supabase xác minh;
 *  - người dùng, tổ và vai trò (admin / trưởng-phó tổ / thành viên) lưu ở bảng dkct_app_*;
 *  - người mới đăng ký chưa thuộc tổ nào nên chưa xem được gì cho tới khi admin xếp tổ;
 *  - module ĐKCT gắn ở /api/dkct như trong ChatLan.
 *
 * createApp({ db, verifyToken, adminEmails, clientDir, publicConfig }):
 *  - verifyToken(token) -> { id, email, fullName } | null (Supabase: auth.getUser)
 *  - adminEmails: email được tự cấp quyền admin (người quản trị đầu tiên)
 */
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const createDkctModule = require('../../server');

const ROLES = ['admin', 'lead', 'member'];

/** Bảng của phần ứng dụng độc lập (cùng kiểu dữ liệu cho Postgres và SQLite). */
const APP_TABLES = {
  dkct_app_departments: `
      name VARCHAR(191) PRIMARY KEY,
      shortName VARCHAR(64) NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
  dkct_app_users: `
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      fullName VARCHAR(255),
      position VARCHAR(255),
      phone VARCHAR(64),
      department VARCHAR(191),
      role VARCHAR(16) NOT NULL DEFAULT 'member',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
};
const APP_TABLE_TEXT = Object.values(APP_TABLES).join(',');

const USER_COLUMNS = 'id, email, fullName, position, phone, department, role, createdAt';
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Token đã xác minh được nhớ 60 giây để không gọi Supabase ở mọi request; token sai nhớ 30 giây.
 * Chuỗi không có dạng JWT (ba phần base64url) bị từ chối ngay, không gọi Supabase (tránh tốn hạn mức khi bị dò).
 */
const JWT_SHAPE = /^[\w-]+\.[\w-]+\.[\w-]+$/;
function cachedVerifier(verifyToken, ttlMs = 60_000, failTtlMs = 30_000) {
  const cache = new Map();
  return async (token) => {
    if (!JWT_SHAPE.test(token) || token.length > 4096) return null;
    const hit = cache.get(token);
    if (hit && hit.until > Date.now()) return hit.user;
    const user = await verifyToken(token);
    if (cache.size > 500) {
      const now = Date.now();
      for (const [k, v] of cache) if (v.until <= now) cache.delete(k);
      if (cache.size > 500) cache.clear();
    }
    cache.set(token, { user: user || null, until: Date.now() + (user ? ttlMs : failTtlMs) });
    return user;
  };
}

/**
 * Giới hạn số request mỗi IP trong một phút (bộ nhớ trong tiến trình, đủ cho một máy chủ):
 * chống dò mật khẩu / token và chống gọi dồn các chức năng nặng (xem trước, xuất Word).
 */
function rateLimit({ max, windowMs = 60_000, message = 'Thao tác quá nhanh, vui lòng thử lại sau ít phút.' }) {
  const hits = new Map();
  let sweepAt = Date.now() + windowMs;
  return (req, res, next) => {
    const now = Date.now();
    if (now > sweepAt) {
      for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
      sweepAt = now + windowMs;
    }
    const key = req.ip || 'unknown';
    let h = hits.get(key);
    if (!h || h.reset <= now) { h = { n: 0, reset: now + windowMs }; hits.set(key, h); }
    h.n += 1;
    if (h.n > max) {
      res.setHeader('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    return next();
  };
}
const HEAVY_PATH = /\/(preview|docx|pdf)(\/|$)/;

function createApp({ db, verifyToken, adminEmails = [], clientDir, publicConfig = {} }) {
  const admins = new Set(adminEmails.map(e => e.trim().toLowerCase()).filter(Boolean));
  const verify = cachedVerifier(verifyToken);

  const getUser = (id) => db.queryOne(`SELECT ${USER_COLUMNS} FROM dkct_app_users WHERE id = ?`, [id]);

  /** Lần đầu đăng nhập thì tạo hồ sơ; email trong ADMIN_EMAILS (đã xác nhận email) luôn là admin. */
  async function ensureUser(identity) {
    const email = text(identity.email, 255).toLowerCase();
    // chưa xác nhận email thì chưa chắc là chủ hộp thư: không cấp admin theo ADMIN_EMAILS
    const admin = admins.has(email) && identity.emailConfirmed !== false;
    let user = await getUser(identity.id);
    if (!user) {
      await db.execute('INSERT IGNORE INTO dkct_app_users (id, email, fullName, role) VALUES (?, ?, ?, ?)',
        [identity.id, email, text(identity.fullName, 255) || null, admin ? 'admin' : 'member']);
      user = await getUser(identity.id);
    } else if (admin && user.role !== 'admin') {
      await db.execute("UPDATE dkct_app_users SET role = 'admin' WHERE id = ?", [user.id]);
      user = { ...user, role: 'admin' };
    }
    return user;
  }

  const requireAuth = wrap(async (req, res, next) => {
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
    const identity = match && await verify(match[1]);
    if (!identity) return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
    req.user = await ensureUser(identity);
    req.userId = req.user.id;
    next();
  });
  // chưa được admin xếp tổ thì chưa xem được dữ liệu nào (lịch, bản vẽ trạm, mạch dòng, nhân sự…)
  const requireMember = (req, res, next) => (req.user?.role === 'admin' || req.user?.department ? next()
    : res.status(403).json({ error: 'Tài khoản chưa được xếp tổ. Liên hệ quản trị viên.' }));
  const requireAdmin = (req, res, next) => (req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Chỉ quản trị viên được làm việc này.' }));

  const listDepartments = () => db.query('SELECT name, shortName FROM dkct_app_departments ORDER BY sortOrder, name');

  const dkct = createDkctModule({
    db,
    getActor: getUser,
    getProfile: getUser,
    isAdmin: (actor) => actor?.role === 'admin',
    isDepartmentHead: () => false,
    isUnitLead: async (userId, department) => {
      const u = await getUser(userId);
      return !!u && u.role === 'lead' && u.department === department;
    },
    getUnit: async (userId) => {
      const u = await getUser(userId);
      const dept = u?.department ? await db.queryOne('SELECT shortName FROM dkct_app_departments WHERE name = ?', [u.department]) : null;
      return { department: u?.department || '', shortName: dept?.shortName || '' };
    },
    listDepartments
  });

  async function migrate() {
    for (const [name, columns] of Object.entries(APP_TABLES)) {
      await db.execute(`CREATE TABLE IF NOT EXISTS ${name} (${columns}\n)`);
    }
    await dkct.migrate();
  }

  const heavyLimit = rateLimit({ max: 40, message: 'Đang xuất / xem trước quá nhiều văn bản, vui lòng thử lại sau ít phút.' });
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render đứng sau proxy
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  app.use('/api', rateLimit({ max: 600 }));
  app.use('/api', (req, res, next) => (HEAVY_PATH.test(req.path) ? heavyLimit(req, res, next) : next()));

  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.get('/api/app/config', (req, res) => res.json(publicConfig));

  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));

  api.get('/me', requireAuth, wrap(async (req, res) => {
    res.json({ user: req.user, departments: await listDepartments() });
  }));

  api.put('/me', requireAuth, wrap(async (req, res) => {
    const b = req.body || {};
    await db.execute('UPDATE dkct_app_users SET fullName = ?, position = ?, phone = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [text(b.fullName, 255) || null, text(b.position, 255) || null, text(b.phone, 64) || null, req.userId]);
    res.json({ user: await getUser(req.userId) });
  }));

  api.get('/departments', requireAuth, wrap(async (req, res) => res.json({ items: await listDepartments() })));

  api.post('/departments', requireAuth, requireAdmin, wrap(async (req, res) => {
    const name = text(req.body?.name, 191);
    const shortName = text(req.body?.shortName, 64);
    if (!name || !shortName) throw bad('Nhập tên tổ và tên viết tắt (dùng trong số giấy, vd 12/ĐK-TNKH).');
    if (await db.queryOne('SELECT name FROM dkct_app_departments WHERE name = ?', [name])) throw bad('Tổ này đã có.', 409);
    const max = await db.queryOne('SELECT MAX(sortOrder) AS n FROM dkct_app_departments');
    await db.execute('INSERT INTO dkct_app_departments (name, shortName, sortOrder) VALUES (?, ?, ?)', [name, shortName, (Number(max?.n) || 0) + 1]);
    res.status(201).json({ items: await listDepartments() });
  }));

  // Chỉ sửa tên viết tắt: tên tổ đã ghi vào giấy, số giấy và quyền xem, đổi tên sẽ làm "mất" hồ sơ cũ.
  api.put('/departments/:name', requireAuth, requireAdmin, wrap(async (req, res) => {
    const shortName = text(req.body?.shortName, 64);
    if (!shortName) throw bad('Nhập tên viết tắt.');
    const r = await db.execute('UPDATE dkct_app_departments SET shortName = ? WHERE name = ?', [shortName, req.params.name]);
    if (!Number(r.changes ?? r.affectedRows)) throw bad('Không tìm thấy tổ.', 404);
    res.json({ items: await listDepartments() });
  }));

  api.delete('/departments/:name', requireAuth, requireAdmin, wrap(async (req, res) => {
    const used = await db.queryOne('SELECT COUNT(*) AS n FROM dkct_app_users WHERE department = ?', [req.params.name]);
    if (Number(used?.n) > 0) throw bad('Tổ còn thành viên, chuyển họ sang tổ khác trước khi xóa.', 409);
    await db.execute('DELETE FROM dkct_app_departments WHERE name = ?', [req.params.name]);
    res.json({ items: await listDepartments() });
  }));

  api.get('/users', requireAuth, requireAdmin, wrap(async (req, res) => {
    res.json({ items: await db.query(`SELECT ${USER_COLUMNS} FROM dkct_app_users ORDER BY department, fullName, email`) });
  }));

  api.put('/users/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
    const target = await getUser(req.params.id);
    if (!target) throw bad('Không tìm thấy người dùng.', 404);
    const role = req.body?.role ?? target.role;
    if (!ROLES.includes(role)) throw bad('Vai trò không hợp lệ.');
    if (target.id === req.userId && role !== 'admin') throw bad('Không tự bỏ quyền admin của chính mình.');
    let department = req.body?.department === undefined ? target.department : text(req.body.department, 191) || null;
    if (department && !(await db.queryOne('SELECT name FROM dkct_app_departments WHERE name = ?', [department]))) throw bad('Tổ không tồn tại.');
    await db.execute('UPDATE dkct_app_users SET role = ?, department = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [role, department, target.id]);
    res.json({ user: await getUser(target.id) });
  }));

  app.use('/api/app', api);
  app.use('/api/dkct', requireAuth, requireMember, dkct.router);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Không tìm thấy.' }));

  // eslint-disable-next-line no-unused-vars
  app.use('/api', (err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error('[app]', err);
    res.status(status).json({ error: status >= 500 ? 'Lỗi máy chủ.' : err.message });
  });

  if (clientDir && fs.existsSync(path.join(clientDir, 'index.html'))) {
    // file trong assets/ có mã băm trong tên: lưu đệm lâu; index.html luôn hỏi lại để thấy bản mới ngay sau khi deploy
    app.use('/assets', express.static(path.join(clientDir, 'assets'), { index: false, maxAge: '1y', immutable: true }));
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  // tự tải lịch cắt điện theo giờ hẹn (admin đặt hoặc OUTAGE_AUTO_FETCH); bản này không có chat nên chỉ ghi nhật ký, đánh dấu
  return { app, migrate, startAutoFetch: () => dkct.startAutoFetch(), stopAutoFetch: () => dkct.stopAutoFetch() };
}

module.exports = { createApp, APP_TABLE_TEXT, ROLES };
