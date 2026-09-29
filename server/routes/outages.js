/**
 * Lịch cắt điện: import Excel (xem trước -> lưu), tra cứu, tạo giấy nháp từ một dòng lịch.
 * Lịch dùng chung cho mọi tổ; import lại cùng kỳ thì cập nhật tình trạng / giờ thực tế của dòng đã có.
 */
const express = require('express');
const multer = require('multer');
const { newId } = require('../schema');
const { forbidden } = require('../policy');
const { readOutageWorkbook } = require('../services/outageExcel');
const { draftFromOutage } = require('../services/registration');
const { likePattern, LIKE, changedRows } = require('../util');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (req, file, cb) => cb(null, /\.xlsx?$/i.test(file.originalname))
});

function outageRouter({ db, policy, wrap, buildDraftDefaults }) {
  const router = express.Router();

  // Kiểm tra quyền TRƯỚC khi nhận file: người không có quyền không đẩy được file vào bộ nhớ
  const requireImporter = wrap(async (req, res, next) => {
    const actor = await policy.actorOf(req);
    if (!(await policy.canCreate(actor))) throw forbidden('Chỉ trưởng/phó tổ, trưởng phòng hoặc admin được import lịch cắt điện.');
    req.dkctActor = actor;
    next();
  });

  async function parseUpload(req) {
    if (!req.file) throw Object.assign(new Error('Chọn file Excel lịch cắt điện (.xlsx hoặc .xls).'), { status: 400 });
    const parsed = await readOutageWorkbook(req.file.buffer);
    const existing = new Map();
    if (parsed.rows.length) {
      const hashes = parsed.rows.map(r => r.rowHash);
      const found = await db.query(
        `SELECT id, rowHash FROM dkct_outages WHERE rowHash IN (${hashes.map(() => '?').join(', ')})`, hashes
      );
      found.forEach(r => existing.set(r.rowHash, r.id));
    }
    return { parsed, existing };
  }

  router.post('/outages/import/preview', requireImporter, upload.single('file'), wrap(async (req, res) => {
    const { parsed, existing } = await parseUpload(req);
    res.json({
      rows: parsed.rows.map(r => ({ ...r, alreadyImported: existing.has(r.rowHash) })),
      errors: parsed.errors,
      duplicates: parsed.duplicates
    });
  }));

  router.post('/outages/import/commit', requireImporter, upload.single('file'), wrap(async (req, res) => {
    const { parsed, existing } = await parseUpload(req);
    let inserted = 0;
    let updated = 0;
    for (const r of parsed.rows) {
      if (existing.has(r.rowHash)) {
        updated += changedRows(await db.execute(`
          UPDATE dkct_outages SET actualStart = ?, actualEnd = ?, registrationUnit = ?, workUnit = ?, status = ?
          WHERE id = ? AND (COALESCE(actualStart, '') <> COALESCE(?, '') OR COALESCE(actualEnd, '') <> COALESCE(?, '')
            OR COALESCE(registrationUnit, '') <> ? OR COALESCE(workUnit, '') <> ? OR COALESCE(status, '') <> ?)`,
        [r.actualStart, r.actualEnd, r.registrationUnit, r.workUnit, r.status, existing.get(r.rowHash),
          r.actualStart, r.actualEnd, r.registrationUnit, r.workUnit, r.status]));
        continue;
      }
      inserted += changedRows(await db.execute(`
        INSERT IGNORE INTO dkct_outages (id, regStart, regEnd, actualStart, actualEnd, location, content, scope,
          registrationUnit, workUnit, status, rowHash, sourceFile, importedBy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId('LCD'), r.regStart, r.regEnd, r.actualStart, r.actualEnd, r.location, r.content, r.scope,
        r.registrationUnit, r.workUnit, r.status, r.rowHash, req.file.originalname.slice(0, 255), req.dkctActor.id]));
    }
    res.json({ inserted, updated, skipped: parsed.rows.length - inserted - updated, errors: parsed.errors });
  }));

  router.get('/outages', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    const where = [];
    const params = [actor.department || ''];
    const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
    const from = date(req.query.from);
    const to = date(req.query.to);
    // thời gian lưu "YYYY-MM-DDTHH:mm": so sánh chuỗi là đủ; lấy các lịch còn hiệu lực trong khoảng
    if (from) { where.push('regEnd >= ?'); params.push(`${from}T00:00`); }
    if (to) { where.push('regStart <= ?'); params.push(`${to}T23:59`); }
    const search = String(req.query.search || '').trim();
    if (search) {
      where.push(`(location ${LIKE} OR content ${LIKE} OR scope ${LIKE} OR workUnit ${LIKE} OR registrationUnit ${LIKE})`);
      params.push(...Array(5).fill(likePattern(search)));
    }
    // chỉ đếm giấy của tổ người xem (không lộ hoạt động của tổ khác)
    const items = await db.query(`
      SELECT o.*, (SELECT COUNT(*) FROM dkct_registrations r WHERE r.outageId = o.id AND r.department = ?) AS registrationCount
      FROM dkct_outages o ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY regStart LIMIT 1000`, params);
    res.json({ items: items.map(o => ({ ...o, registrationCount: Number(o.registrationCount) || 0 })) });
  }));

  router.delete('/outages/:id', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    const outage = await db.queryOne('SELECT importedBy FROM dkct_outages WHERE id = ?', [req.params.id]);
    if (!outage) return res.status(404).json({ error: 'Không tìm thấy dòng lịch.' });
    // lịch dùng chung cho mọi tổ: chỉ người đã import hoặc admin được xóa
    if (!policy.isAdmin(actor) && outage.importedBy !== actor.id) throw forbidden('Chỉ người đã import dòng lịch này hoặc admin được xóa.');
    const used = await db.queryOne('SELECT COUNT(*) AS n FROM dkct_registrations WHERE outageId = ?', [req.params.id]);
    if (Number(used?.n) > 0) return res.status(409).json({ error: 'Dòng lịch này đã có giấy đăng ký công tác, không xóa được.' });
    if (!changedRows(await db.execute('DELETE FROM dkct_outages WHERE id = ?', [req.params.id]))) {
      return res.status(404).json({ error: 'Không tìm thấy dòng lịch.' });
    }
    res.json({ success: true });
  }));

  router.get('/outages/:id/draft', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    const outage = await db.queryOne('SELECT * FROM dkct_outages WHERE id = ?', [req.params.id]);
    if (!outage) return res.status(404).json({ error: 'Không tìm thấy dòng lịch.' });
    const defaults = await buildDraftDefaults(actor);
    res.json({ draft: { ...defaults, ...draftFromOutage(outage), risks: defaults.risks } });
  }));

  return router;
}

module.exports = { outageRouter };
