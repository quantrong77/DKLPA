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
const { vnNow, vnToday } = require('../services/clock');
const { fetchOutageWorkbook, sourceConfig, configured } = require('../services/outageSource');

const MAX_FETCH_DAYS = 62; // tải tự động tối đa ~2 tháng một lần

// tình trạng ghi "Hoãn" trong file lịch
const POSTPONED_STATUS = /ho[ãa]n/i;
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const brief = (r) => ({ id: r.id || null, rowHash: r.rowHash, regStart: r.regStart, regEnd: r.regEnd, location: r.location, content: r.content, status: r.status || '' });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (req, file, cb) => cb(null, /\.xlsx?$/i.test(file.originalname))
});

function outageRouter({ db, policy, wrap, buildDraftDefaults, outageSource }) {
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
    return parseBuffer(req.file.buffer);
  }

  async function parseBuffer(buffer) {
    const parsed = await readOutageWorkbook(buffer);
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

  /**
   * So file mới với lịch đã nạp trong khoảng [from, to] (theo ngày bắt đầu đăng ký):
   * - phát sinh: dòng trong file chưa có trước đó;
   * - hoãn: dòng đã nạp nhưng file mới không còn, hoặc file ghi tình trạng "Hoãn";
   * - không đổi: còn lại. Không có khoảng, hoặc trong khoảng chưa nạp lịch nào -> null (không so sánh).
   */
  async function compareImport(parsed, existing, body) {
    const from = isoDate(body?.compareFrom);
    const to = isoDate(body?.compareTo);
    if (!from || !to || from > to) return null;
    const lo = `${from}T00:00`;
    const hi = `${to}T23:59`;
    const inRange = (r) => r.regStart >= lo && r.regStart <= hi;
    const fileRows = parsed.rows.filter(inRange);
    const inFile = new Set(fileRows.map(r => r.rowHash));
    const before = await db.query(`SELECT id, regStart, regEnd, location, content, status, rowHash FROM dkct_outages
      WHERE regStart >= ? AND regStart <= ? ORDER BY regStart`, [lo, hi]);
    if (!before.length) return null; // chưa nạp lịch nào trong khoảng: không có gì để so (không đánh dấu cả file là phát sinh)
    const idOf = new Map(before.map(o => [o.rowHash, o.id]));
    const postponed = [
      ...before.filter(o => !inFile.has(o.rowHash)).map(o => ({ ...brief(o), reason: 'Không còn trong lịch mới' })),
      ...fileRows.filter(r => POSTPONED_STATUS.test(r.status || '')).map(r => ({ ...brief({ ...r, id: idOf.get(r.rowHash) }), reason: `Tình trạng: ${r.status}` }))
    ];
    const added = fileRows.filter(r => !existing.has(r.rowHash) && !POSTPONED_STATUS.test(r.status || '')).map(r => brief(r));
    return { from, to, previous: before.length, postponed, added, unchanged: fileRows.length - added.length - postponed.filter(p => inFile.has(p.rowHash)).length };
  }

  /** Ghi dấu so sánh vào các dòng lịch trong khoảng (bỏ dấu cũ trước). */
  async function markChanges(cmp) {
    const now = vnNow();
    await db.execute('UPDATE dkct_outages SET changeKind = NULL, changeAt = NULL WHERE regStart >= ? AND regStart <= ?', [`${cmp.from}T00:00`, `${cmp.to}T23:59`]);
    for (const [kind, list] of [['NEW', cmp.added], ['POSTPONED', cmp.postponed]]) {
      const hashes = list.map(r => r.rowHash);
      for (let i = 0; i < hashes.length; i += 200) {
        const part = hashes.slice(i, i + 200);
        await db.execute(`UPDATE dkct_outages SET changeKind = ?, changeAt = ? WHERE rowHash IN (${part.map(() => '?').join(', ')})`, [kind, now, ...part]);
      }
    }
    // id của dòng vừa thêm (để liên kết tới dòng trong danh sách)
    const hashes = [...cmp.added, ...cmp.postponed].filter(r => !r.id).map(r => r.rowHash);
    if (hashes.length) {
      const rows = await db.query(`SELECT id, rowHash FROM dkct_outages WHERE rowHash IN (${hashes.map(() => '?').join(', ')})`, hashes);
      const ids = new Map(rows.map(r => [r.rowHash, r.id]));
      for (const r of [...cmp.added, ...cmp.postponed]) r.id = r.id || ids.get(r.rowHash) || null;
    }
  }

  // khoảng ngày của file (gợi ý khoảng so sánh)
  const spanOf = (rows) => {
    const days = rows.map(r => String(r.regStart).slice(0, 10)).filter(Boolean).sort();
    return days.length ? { from: days[0], to: days[days.length - 1] } : null;
  };

  router.post('/outages/import/preview', requireImporter, upload.single('file'), wrap(async (req, res) => {
    const { parsed, existing } = await parseUpload(req);
    res.json({
      rows: parsed.rows.map(r => ({ ...r, alreadyImported: existing.has(r.rowHash) })),
      errors: parsed.errors,
      duplicates: parsed.duplicates,
      span: spanOf(parsed.rows),
      compare: await compareImport(parsed, existing, req.body)
    });
  }));

  router.post('/outages/import/commit', requireImporter, upload.single('file'), wrap(async (req, res) => {
    const { parsed, existing } = await parseUpload(req);
    const compare = await compareImport(parsed, existing, req.body); // so với lịch trước khi ghi
    const saved = await saveRows(parsed, existing, req.file.originalname, req.dkctActor.id);
    if (compare) await markChanges(compare);
    res.json({ ...saved, errors: parsed.errors, compare });
  }));

  // Tải lịch từ trang Công ty theo khoảng ngày rồi nạp luôn (so với lịch đã nạp trong đúng khoảng đó)
  router.get('/outages/source', wrap(async (req, res) => {
    await policy.actorOf(req);
    res.json({ configured: configured(sourceConfig(outageSource)) });
  }));

  router.post('/outages/fetch', requireImporter, wrap(async (req, res) => {
    const from = isoDate(req.body?.from);
    const to = isoDate(req.body?.to);
    if (!from || !to || from > to) throw Object.assign(new Error('Chọn khoảng ngày cần tải (từ ngày ≤ đến ngày).'), { status: 400 });
    if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_FETCH_DAYS) throw Object.assign(new Error(`Mỗi lần tải tối đa ${MAX_FETCH_DAYS} ngày.`), { status: 400 });
    const buffer = await fetchOutageWorkbook({ from, to }, outageSource);
    const { parsed, existing } = await parseBuffer(buffer);
    const compare = await compareImport(parsed, existing, { compareFrom: from, compareTo: to });
    const saved = await saveRows(parsed, existing, `Tải tự động ${from}..${to} (${vnToday()})`, req.dkctActor.id);
    if (compare) await markChanges(compare);
    res.json({ ...saved, rows: parsed.rows.length, errors: parsed.errors, compare, from, to });
  }));

  /** Ghi các dòng lịch: dòng đã có -> cập nhật tình trạng/giờ thực tế/đơn vị; dòng mới -> thêm. */
  async function saveRows(parsed, existing, sourceFile, actorId) {
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
        r.registrationUnit, r.workUnit, r.status, r.rowHash, String(sourceFile || '').slice(0, 255), actorId]));
    }
    return { inserted, updated, skipped: parsed.rows.length - inserted - updated };
  }

  router.get('/outages', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    const where = [];
    const dept = actor.department || '';
    const params = [dept, dept, dept];
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
    // tiến độ 3 bước (biên bản KSHT → phương án → giấy ĐKCT): chỉ đếm hồ sơ của tổ người xem (không lộ hoạt động của tổ khác)
    const items = await db.query(`
      SELECT o.*,
        (SELECT COUNT(*) FROM dkct_surveys s WHERE s.outageId = o.id AND s.department = ?) AS surveyCount,
        (SELECT COUNT(*) FROM dkct_plans p WHERE p.outageId = o.id AND p.department = ?) AS planCount,
        (SELECT COUNT(*) FROM dkct_registrations r WHERE r.outageId = o.id AND r.department = ?) AS registrationCount
      FROM dkct_outages o ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY regStart LIMIT 1000`, params);
    const count = (v) => Number(v) || 0;
    res.json({
      items: items.map(o => ({
        ...o, surveyCount: count(o.surveyCount), planCount: count(o.planCount), registrationCount: count(o.registrationCount)
      }))
    });
  }));

  // Chi tiết một dòng lịch (khung "Lịch cắt điện liên quan" của biên bản KSHT, phương án); lịch dùng chung mọi tổ
  router.get('/outages/:id', wrap(async (req, res) => {
    await policy.actorOf(req);
    const outage = await db.queryOne(`SELECT id, regStart, regEnd, actualStart, actualEnd, location, content, scope,
      registrationUnit, workUnit, status FROM dkct_outages WHERE id = ?`, [req.params.id]);
    if (!outage) return res.status(404).json({ error: 'Không tìm thấy dòng lịch.' });
    res.json({ outage });
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
