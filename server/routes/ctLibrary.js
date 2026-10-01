/**
 * Thư viện cô lập mạch dòng: biến dòng (TI) của trạm, các core và 6 điểm mỗi core (pha, hàng kẹp tại tủ trung gian,
 * đầu phía CT), ảnh các trang mạch dòng để khoanh vùng/xem lại nguồn. Phương án chọn TI để in Phụ lục II.
 * Ai đăng nhập cũng xem được; tạm thời chỉ admin thêm/sửa/xác nhận. Mọi thay đổi ghi nhật ký dkct_ct_audit.
 */
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const { forbidden } = require('../policy');
const { newId, sameUnitName } = require('../schema');
const { imageInfo } = require('../services/surveyRender');
const { vnNow } = require('../services/clock');
const { safeParse, likePattern, LIKE } = require('../util');
const { normalizeCt, validateCt, pointStatus, diffCores, INSUFFICIENT } = require('../services/ctLibrary');

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_SIDE = 12000;
const MAX_PAGES = 40;
const DEFAULT_CORES = 4;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE, files: 1, fields: 6 } }).single('image');

const fail = (status, message, extra) => Object.assign(new Error(message), { status, ...extra });
const PAGE_META = 'id, transformerId, revision, pageLabel, fileName, imageType, width, height, uploadedBy, createdAt';
const HEADER_FIELDS = ['substationId', 'name', 'bay', 'panel', 'drawingNumber', 'note'];
const toBuffer = (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v));
// tọa độ vùng lưu số nguyên phần vạn (cùng kiểu INT cho MySQL/SQLite/Postgres)
const toInt = (v) => Math.round(v * 10000);
const fromInt = (v) => (v === null || v === undefined ? null : Number(v) / 10000);
// id nhật ký sắp theo thời gian (createdAt chỉ tới giây)
const auditId = () => `AU-${Date.now().toString(36).padStart(9, '0')}-${crypto.randomBytes(3).toString('hex')}`;

/** Core + điểm của TI theo dạng normalizeCt (để so sánh, kiểm tra). */
async function readCores(db, transformerId) {
  const cores = await db.query('SELECT * FROM dkct_ct_cores WHERE transformerId = ? ORDER BY sortOrder, coreNo', [transformerId]);
  const points = cores.length
    ? await db.query(`SELECT p.* FROM dkct_ct_points p JOIN dkct_ct_cores c ON c.id = p.coreId WHERE c.transformerId = ? ORDER BY p.seq`, [transformerId])
    : [];
  return cores.map(c => ({
    id: c.id,
    coreNo: c.coreNo === null ? null : Number(c.coreNo),
    terminalBlock: c.terminalBlock || '',
    drawingRef: c.drawingRef || '',
    spec: c.spec || '',
    pageId: c.pageId || null,
    region: c.pageId && c.regionW ? { x: fromInt(c.regionX), y: fromInt(c.regionY), w: fromInt(c.regionW), h: fromInt(c.regionH) } : null,
    points: points.filter(p => p.coreId === c.id).map(p => ({ seq: Number(p.seq), phase: p.phase, terminal: p.terminal || null, ctTerminal: p.ctTerminal || null }))
  }));
}

/** Dấu vết nội dung các core (thứ tự + mọi trường): khác nhau thì phải ghi lại. */
const coreSignature = (cores) => JSON.stringify(cores.map(c => [c.id, c.coreNo, c.terminalBlock, c.drawingRef, c.spec, c.pageId, c.region,
  c.points.map(p => [p.terminal || null, p.ctTerminal || null])]));

/**
 * Trạng thái in của một bảng mạch dòng trong phương án: chỉ "VERIFIED" khi TI trong thư viện đã xác nhận
 * và bản chụp gửi lên trùng với dữ liệu đã xác nhận (tên, tủ, các core in ra). Còn lại in bản nháp.
 */
async function libraryBlockStatus(db, block) {
  const row = await db.queryOne('SELECT id, name, panel, status FROM dkct_ct_transformers WHERE id = ?', [block.ctId]);
  if (!row || row.status !== 'VERIFIED' || (row.name || '') !== block.name || (row.panel || '') !== block.panel) return 'DRAFT';
  const stored = new Map((await readCores(db, row.id)).map(c => [c.coreNo, c]));
  const same = block.cores.every(c => {
    const s = stored.get(c.coreNo);
    return s && s.terminalBlock === c.terminalBlock && (s.drawingRef || '') === c.drawingRef
      && c.points.every((p, i) => (s.points[i]?.terminal || '') === p.terminal && (s.points[i]?.ctTerminal || '') === p.ctTerminal);
  });
  return same && block.cores.length > 0 ? 'VERIFIED' : 'DRAFT';
}

function ctLibraryRouter({ db, policy, wrap }) {
  const router = express.Router();

  const requireAdmin = async (req) => {
    const actor = await policy.actorOf(req);
    if (!policy.isAdmin(actor)) throw forbidden('Chỉ admin được sửa thư viện mạch dòng.');
    return actor;
  };
  const audit = (transformerId, action, detail, userId) => db.execute(
    'INSERT INTO dkct_ct_audit (id, transformerId, action, detail, userId) VALUES (?, ?, ?, ?, ?)',
    [auditId(), transformerId, action, JSON.stringify(detail || {}), userId]);

  async function loadRow(id) {
    const row = await db.queryOne('SELECT * FROM dkct_ct_transformers WHERE id = ? AND active = 1', [id]);
    if (!row) throw fail(404, 'Không tìm thấy biến dòng trong thư viện.');
    return row;
  }

  const loadCores = (id) => readCores(db, id);

  /** TI đầy đủ cho giao diện: thông tin, các trang (mọi revision), core + điểm kèm trạng thái, các vấn đề cần kiểm tra. */
  async function present(id) {
    const row = await loadRow(id);
    const [cores, pages, sub] = await Promise.all([
      loadCores(id),
      db.query(`SELECT ${PAGE_META} FROM dkct_ct_pages WHERE transformerId = ? ORDER BY revision, createdAt, id`, [id]),
      db.queryOne('SELECT name FROM dkct_substations WHERE id = ?', [row.substationId])
    ]);
    const issues = validateCt({ ...row, cores });
    return {
      ct: {
        ...row,
        revision: Number(row.revision),
        substationName: sub?.name || '',
        pages: pages.map(p => ({ ...p, revision: Number(p.revision) })),
        cores: cores.map(c => ({ ...c, points: c.points.map(p => ({ ...p, status: pointStatus(p, row.status) })) }))
      },
      issues
    };
  }

  async function checkSubstation(substationId) {
    if (!substationId || !(await db.queryOne('SELECT id FROM dkct_substations WHERE id = ? AND active = 1', [substationId]))) {
      throw fail(400, 'Chọn trạm biến áp của biến dòng.');
    }
  }
  async function checkNameFree(substationId, name, exceptId = null) {
    const rows = await db.query('SELECT id, name FROM dkct_ct_transformers WHERE substationId = ? AND active = 1', [substationId]);
    if (rows.some(r => r.id !== exceptId && sameUnitName(r.name, name))) throw fail(409, `Trạm đã có "${name}" trong thư viện.`);
  }

  const insertPoints = async (coreId, points) => {
    for (const p of points) {
      await db.execute('INSERT INTO dkct_ct_points (id, coreId, seq, phase, terminal, ctTerminal) VALUES (?, ?, ?, ?, ?, ?)',
        [newId('MD'), coreId, p.seq, p.phase, p.terminal, p.ctTerminal]);
    }
  };
  const coreValues = (c, i) => [i + 1, c.coreNo, c.terminalBlock, c.drawingRef, c.spec, c.pageId,
    c.region ? toInt(c.region.x) : null, c.region ? toInt(c.region.y) : null, c.region ? toInt(c.region.w) : null, c.region ? toInt(c.region.h) : null];

  /**
   * Ghi danh sách core: cập nhật core có sẵn (theo id), thêm core mới, xóa core bị bỏ (điểm xóa theo khóa ngoại).
   * Không xóa-rồi-thêm cả TI để lỗi giữa chừng không làm mất dữ liệu đã có.
   */
  async function writeCores(transformerId, cores, existing) {
    const keep = new Set();
    for (let i = 0; i < cores.length; i++) {
      const c = cores[i];
      const old = c.id && existing.find(e => e.id === c.id);
      if (old) {
        keep.add(old.id);
        await db.execute(`UPDATE dkct_ct_cores SET sortOrder = ?, coreNo = ?, terminalBlock = ?, drawingRef = ?, spec = ?, pageId = ?,
          regionX = ?, regionY = ?, regionW = ?, regionH = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [...coreValues(c, i), old.id]);
        // dòng đã có thì sửa, chưa có thì thêm (không dựa vào số dòng bị đổi: MySQL có thể báo 0 khi giá trị không đổi)
        const seqs = new Set(old.points.map(p => p.seq));
        for (const p of c.points) {
          if (seqs.has(p.seq)) {
            await db.execute('UPDATE dkct_ct_points SET phase = ?, terminal = ?, ctTerminal = ? WHERE coreId = ? AND seq = ?',
              [p.phase, p.terminal, p.ctTerminal, old.id, p.seq]);
          } else await insertPoints(old.id, [p]);
        }
      } else {
        const id = newId('CORE');
        await db.execute(`INSERT INTO dkct_ct_cores (sortOrder, coreNo, terminalBlock, drawingRef, spec, pageId, regionX, regionY, regionW, regionH, id, transformerId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...coreValues(c, i), id, transformerId]);
        await insertPoints(id, c.points);
      }
    }
    for (const e of existing) if (!keep.has(e.id)) await db.execute('DELETE FROM dkct_ct_cores WHERE id = ?', [e.id]);
  }

  /** Trang dùng cho core phải thuộc chính TI này; trang lạ thì bỏ liên kết. */
  async function ownPages(transformerId, cores) {
    const ids = new Set((await db.query('SELECT id FROM dkct_ct_pages WHERE transformerId = ?', [transformerId])).map(p => p.id));
    return cores.map(c => (c.pageId && ids.has(c.pageId) ? c : { ...c, pageId: null, region: null }));
  }

  function normalized(body) {
    const { data, errors } = normalizeCt(body || {});
    if (errors.length) throw fail(400, errors[0].message, { errors });
    return { ...data, substationId: String(body?.substationId || '').slice(0, 64) };
  }

  router.get('/ct-library', wrap(async (req, res) => {
    await policy.actorOf(req);
    const params = [];
    let where = 'c.active = 1 AND s.active = 1';
    if (req.query.substationId) { where += ' AND c.substationId = ?'; params.push(String(req.query.substationId)); }
    const items = await db.query(`SELECT c.id, c.substationId, s.name AS substationName, c.bay, c.name, c.panel, c.drawingNumber, c.status,
        c.revision, c.updatedAt, (SELECT COUNT(*) FROM dkct_ct_cores k WHERE k.transformerId = c.id) AS coreCount
      FROM dkct_ct_transformers c JOIN dkct_substations s ON s.id = c.substationId
      WHERE ${where} ORDER BY s.sortOrder, s.name, c.name`, params);
    res.json({ items: items.map(x => ({ ...x, coreCount: Number(x.coreCount), revision: Number(x.revision) })) });
  }));

  router.get('/ct-library/:id', wrap(async (req, res) => {
    await policy.actorOf(req);
    res.json(await present(req.params.id));
  }));

  router.post('/ct-library', wrap(async (req, res) => {
    const actor = await requireAdmin(req);
    const data = normalized(req.body);
    await checkSubstation(data.substationId);
    await checkNameFree(data.substationId, data.name);
    const id = newId('TI');
    await db.execute(`INSERT INTO dkct_ct_transformers (id, substationId, bay, name, panel, drawingNumber, note, createdBy, updatedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, data.substationId, data.bay, data.name, data.panel, data.drawingNumber, data.note, actor.id, actor.id]);
    // TI mới: mặc định 4 core trống (thường 4–8 core), người dùng thêm/bớt
    const cores = data.cores.length ? data.cores
      : normalizeCt({ name: data.name, cores: Array.from({ length: DEFAULT_CORES }, (_, i) => ({ coreNo: i + 1 })) }).data.cores;
    await writeCores(id, cores.map(c => ({ ...c, id: null, pageId: null, region: null })), []);
    await audit(id, 'CREATE', { name: data.name }, actor.id);
    res.status(201).json(await present(id));
  }));

  router.put('/ct-library/:id', wrap(async (req, res) => {
    const actor = await requireAdmin(req);
    const row = await loadRow(req.params.id);
    const data = normalized({ substationId: row.substationId, ...req.body });
    await checkSubstation(data.substationId);
    await checkNameFree(data.substationId, data.name, row.id);
    const existing = await loadCores(row.id);
    // core gửi lên không kèm id (vd gọi API trực tiếp): ghép với core cùng số còn trống để không tạo lại core
    const used = new Set(data.cores.map(c => c.id).filter(Boolean));
    const withIds = data.cores.map(c => {
      if (c.id) return c;
      const match = existing.find(e => !used.has(e.id) && e.coreNo === c.coreNo);
      if (!match) return c;
      used.add(match.id);
      return { ...c, id: match.id };
    });
    const cores = await ownPages(row.id, withIds);
    const fields = HEADER_FIELDS.filter(f => String(row[f] || '') !== String(data[f] || ''))
      .map(f => ({ field: f, from: row[f] || '', to: data[f] || '' }));
    const coresChanged = coreSignature(existing) !== coreSignature(cores);
    if (!coresChanged && !fields.length) return res.json(await present(row.id));
    // diffCores theo số core để người đọc nhật ký hiểu; đổi thứ tự / số core trùng thì ghi kèm cờ
    const changes = diffCores(existing, cores);
    await db.execute(`UPDATE dkct_ct_transformers SET substationId = ?, bay = ?, name = ?, panel = ?, drawingNumber = ?, note = ?,
      status = 'DRAFT', updatedBy = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    [data.substationId, data.bay, data.name, data.panel, data.drawingNumber, data.note, actor.id, row.id]);
    await writeCores(row.id, cores, existing);
    await audit(row.id, 'UPDATE', { fields, changes, ...(coresChanged && !changes.length ? { reordered: true } : {}) }, actor.id);
    res.json(await present(row.id));
  }));

  // Xác nhận: kỹ sư đã đối chiếu bản vẽ; còn lỗi (ô CHƯA ĐỦ DỮ LIỆU, trùng…) thì không cho
  router.post('/ct-library/:id/verify', wrap(async (req, res) => {
    const actor = await requireAdmin(req);
    const { ct, issues } = await present(req.params.id);
    const errors = issues.filter(i => i.level === 'error');
    if (errors.length) {
      const insufficient = errors.filter(e => e.code === 'INSUFFICIENT_DATA').length;
      return res.status(422).json({
        error: insufficient ? `Còn ${insufficient} mục ${INSUFFICIENT}; kiểm tra bản vẽ rồi bổ sung trước khi xác nhận.` : errors[0].message,
        issues
      });
    }
    await db.execute(`UPDATE dkct_ct_transformers SET status = 'VERIFIED', verifiedBy = ?, verifiedAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [actor.id, vnNow(), ct.id]);
    await audit(ct.id, 'VERIFY', { revision: ct.revision }, actor.id);
    res.json(await present(ct.id));
  }));

  router.delete('/ct-library/:id', wrap(async (req, res) => {
    const actor = await requireAdmin(req);
    const row = await loadRow(req.params.id);
    await db.execute('UPDATE dkct_ct_transformers SET active = 0, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
    await audit(row.id, 'HIDE', { name: row.name }, actor.id);
    res.json({ success: true });
  }));

  router.get('/ct-library/:id/audit', wrap(async (req, res) => {
    await policy.actorOf(req);
    const rows = await db.query('SELECT id, action, detail, userId, createdAt FROM dkct_ct_audit WHERE transformerId = ? ORDER BY id DESC', [req.params.id]);
    res.json({ items: rows.map(({ detail, ...r }) => { const d = safeParse(detail); return { ...r, ...d, changes: d.changes || [] }; }) });
  }));

  // Thêm ảnh một trang mạch dòng (multipart: image, pageLabel, fileName, newRevision=1 khi bản vẽ cập nhật).
  // Kiểm tra quyền TRƯỚC khi nhận file.
  const pageGuard = wrap(async (req, res, next) => {
    req.dkctActor = await requireAdmin(req);
    req.dkctCt = await loadRow(req.params.id);
    next();
  });
  router.post('/ct-library/:id/pages', pageGuard, upload, wrap(async (req, res) => {
    const { dkctActor: actor, dkctCt: row } = req;
    const file = req.file;
    const info = file ? imageInfo(file.buffer) : null;
    if (!info) throw fail(400, 'Chọn ảnh trang mạch dòng (PNG/JPG, tối đa 10 MB).');
    if (!info.width || !info.height || info.width > MAX_SIDE || info.height > MAX_SIDE) throw fail(400, `Ảnh phải nhỏ hơn ${MAX_SIDE}×${MAX_SIDE} điểm ảnh.`);
    const count = await db.queryOne('SELECT COUNT(*) AS n FROM dkct_ct_pages WHERE transformerId = ?', [row.id]);
    if (Number(count?.n) >= MAX_PAGES) throw fail(400, `Mỗi biến dòng tối đa ${MAX_PAGES} trang bản vẽ.`);
    const bump = req.body?.newRevision === '1';
    const revision = Number(row.revision) + (bump ? 1 : 0);
    const id = newId('TMD');
    await db.execute(`INSERT INTO dkct_ct_pages (id, transformerId, revision, pageLabel, fileName, image, imageType, width, height, uploadedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, row.id, revision, String(req.body?.pageLabel || '').trim().slice(0, 40), String(req.body?.fileName || file.originalname || '').slice(0, 255),
      file.buffer, info.type, info.width, info.height, actor.id]);
    if (bump) {
      // bản vẽ cập nhật (sau khi đã lưu ảnh): tăng phiên bản, TI về nháp để kiểm tra lại các core theo bản mới
      await db.execute(`UPDATE dkct_ct_transformers SET revision = ?, status = 'DRAFT', updatedBy = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        [revision, actor.id, row.id]);
      await audit(row.id, 'REVISION', { from: revision - 1, to: revision }, actor.id);
    }
    await audit(row.id, 'ADD_PAGE', { pageId: id, pageLabel: req.body?.pageLabel || '', revision }, actor.id);
    res.status(201).json({ page: await db.queryOne(`SELECT ${PAGE_META} FROM dkct_ct_pages WHERE id = ?`, [id]) });
  }));

  router.get('/ct-pages/:id/image', wrap(async (req, res) => {
    await policy.actorOf(req);
    const row = await db.queryOne('SELECT image, imageType FROM dkct_ct_pages WHERE id = ?', [req.params.id]);
    if (!row) throw fail(404, 'Không tìm thấy trang bản vẽ.');
    res.setHeader('Content-Type', `image/${row.imageType}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(toBuffer(row.image));
  }));

  router.delete('/ct-pages/:id', wrap(async (req, res) => {
    const actor = await requireAdmin(req);
    const page = await db.queryOne('SELECT id, transformerId, pageLabel FROM dkct_ct_pages WHERE id = ?', [req.params.id]);
    if (!page) throw fail(404, 'Không tìm thấy trang bản vẽ.');
    if (await db.queryOne('SELECT id FROM dkct_ct_cores WHERE pageId = ?', [page.id])) {
      throw fail(409, 'Trang này đang dùng làm nguồn của core; khoanh vùng core trên trang khác trước khi xóa.');
    }
    // phương án đã lập lưu bản chụp có id trang: giữ trang để còn xem lại nguồn
    if (await db.queryOne(`SELECT id FROM dkct_plans WHERE data ${LIKE}`, [likePattern(page.id)])) {
      throw fail(409, 'Phương án đã lập đang dùng trang này để xem lại mạch dòng; không xóa được.');
    }
    await db.execute('DELETE FROM dkct_ct_pages WHERE id = ?', [page.id]);
    await audit(page.transformerId, 'DELETE_PAGE', { pageId: page.id, pageLabel: page.pageLabel }, actor.id);
    res.json({ success: true });
  }));

  return router;
}

module.exports = { ctLibraryRouter, readCores, libraryBlockStatus };
