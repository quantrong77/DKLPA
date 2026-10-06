/**
 * Lịch cắt điện: import Excel (xem trước -> lưu), tra cứu, tạo giấy nháp từ một dòng lịch.
 * Lịch dùng chung cho mọi tổ; import lại cùng kỳ thì cập nhật tình trạng / giờ thực tế của dòng đã có.
 */
const express = require('express');
const multer = require('multer');
const { forbidden } = require('../policy');
const { draftFromOutage } = require('../services/registration');
const { likePattern, LIKE, changedRows } = require('../util');
const { vnToday } = require('../services/clock');
const { sourceConfig, configured, fetchOutageWorkbook } = require('../services/outageSource');
const { isoDate } = require('../services/outageImport');
const { fetchAndImport, MAX_DAYS } = require('../services/outageAutoFetch');
const { newId } = require('../schema');
const { teamResolver, loadTeamAreas, loadAreaSubstations, areaKey, areaOptions } = require('../services/outageArea');
const { executeIn } = require('../services/outageChange');

// dòng lịch đã có biên bản KSHT / phương án / giấy ĐKCT gắn: không xóa khi dọn lịch cũ
const LINKED_SQL = `(EXISTS (SELECT 1 FROM dkct_surveys s WHERE s.outageId = o.id)
  OR EXISTS (SELECT 1 FROM dkct_plans p WHERE p.outageId = o.id)
  OR EXISTS (SELECT 1 FROM dkct_registrations r WHERE r.outageId = o.id))`;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (req, file, cb) => cb(null, /\.xlsx?$/i.test(file.originalname))
});

function outageRouter({ db, policy, wrap, buildDraftDefaults, outageSettings, importer, autoFetch, listDepartments }) {
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
    return importer.parseBuffer(req.file.buffer);
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
      compare: await importer.compareImport(parsed, existing, req.body)
    });
  }));

  router.post('/outages/import/commit', requireImporter, upload.single('file'), wrap(async (req, res) => {
    const result = await importer.importParsed(await parseUpload(req), {
      compareFrom: req.body?.compareFrom, compareTo: req.body?.compareTo, sourceFile: req.file.originalname, actorId: req.dkctActor.id
    });
    res.json(result);
  }));

  // Tải lịch từ trang Công ty theo khoảng ngày rồi nạp luôn (so với lịch đã nạp trong đúng khoảng đó)
  // cấu hình tải lịch và nhật ký các lần tải gần nhất (tự động / bấm tay)
  router.get('/outages/source', wrap(async (req, res) => {
    await policy.actorOf(req);
    const runs = await db.query(`SELECT id, mode, fromDate, toDate, startedAt, finishedAt, ok, rowsCount, summary, error
      FROM dkct_outage_fetches ORDER BY startedAt DESC, id DESC LIMIT 5`);
    res.json({
      configured: configured(sourceConfig(await outageSettings.sourceOptions())),
      auto: (await autoFetch.enabled()) ? await autoFetch.config() : null,
      runs: runs.map(r => ({ ...r, ok: r.ok === null || r.ok === undefined ? null : Number(r.ok) === 1, summary: r.summary ? JSON.parse(r.summary) : null }))
    });
  }));

  // Cấu hình tải lịch (admin): tài khoản trang lịch, mật khẩu (mã hóa, không trả về), giờ tự tải
  const requireAdmin = wrap(async (req, res, next) => {
    const actor = await policy.actorOf(req);
    if (!policy.isAdmin(actor)) throw forbidden('Chỉ admin được cấu hình tải lịch cắt điện.');
    req.dkctActor = actor;
    next();
  });
  router.get('/outage-settings', requireAdmin, wrap(async (req, res) => {
    res.json(await outageSettings.view());
  }));
  router.put('/outage-settings', requireAdmin, wrap(async (req, res) => {
    const b = req.body || {};
    res.json(await outageSettings.save({
      user: b.user, password: b.password, clearPassword: !!b.clearPassword,
      times: b.times, days: b.days, resetAuto: !!b.resetAuto
    }, req.dkctActor.id));
  }));
  // thử đăng nhập + kết xuất lịch hôm nay bằng cấu hình đã lưu (không nạp)
  router.post('/outage-settings/test', requireAdmin, wrap(async (req, res) => {
    const today = vnToday();
    const buffer = await fetchOutageWorkbook({ from: today, to: today }, await outageSettings.sourceOptions());
    res.json({ ok: true, bytes: buffer.length });
  }));

  router.post('/outages/fetch', requireImporter, wrap(async (req, res) => {
    const from = isoDate(req.body?.from);
    const to = isoDate(req.body?.to);
    if (!from || !to || from > to) throw Object.assign(new Error('Chọn khoảng ngày cần tải (từ ngày ≤ đến ngày).'), { status: 400 });
    if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_DAYS) throw Object.assign(new Error(`Mỗi lần tải tối đa ${MAX_DAYS} ngày.`), { status: 400 });
    const result = await fetchAndImport({
      db, importer, outageSource: await outageSettings.sourceOptions(), from, to, mode: 'MANUAL', slot: `manual:${newId('T')}`, actorId: req.dkctActor.id,
      label: `Tải lịch ${from.split('-').reverse().join('/')}–${to.split('-').reverse().join('/')} (${vnToday().split('-').reverse().join('/')})`
    });
    res.json({ ...result, from, to });
  }));

  router.get('/outages', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    await importer.expireMarks();
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
        (SELECT COUNT(*) FROM dkct_registrations r WHERE r.outageId = o.id AND r.department = ?) AS registrationCount,
        (SELECT COUNT(*) FROM dkct_outage_changes c WHERE c.outageId = o.id) AS changeCount
      FROM dkct_outages o ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY regStart LIMIT 1000`, params);
    const count = (v) => Number(v) || 0;
    // "của tổ tôi": tổ đã lập hồ sơ cho dòng lịch, hoặc dòng lịch ở trạm giao riêng cho tổ / thuộc khu vực tổ phụ trách
    const myAreas = (await db.query('SELECT area FROM dkct_team_areas WHERE department = ? ORDER BY area', [dept])).map(r => r.area);
    const substations = await loadAreaSubstations(db);
    const teamsOf = teamResolver(await loadTeamAreas(db), substations);
    res.json({
      myAreas,
      mySubstations: substations.filter(s => dept && s.teamDepartment === dept).map(s => s.name).sort((a, b) => a.localeCompare(b, 'vi')),
      items: items.map(o => {
        const linked = count(o.surveyCount) + count(o.planCount) + count(o.registrationCount) > 0;
        return {
          ...o, surveyCount: count(o.surveyCount), planCount: count(o.planCount), registrationCount: count(o.registrationCount),
          changeCount: count(o.changeCount), mine: linked || (!!dept && teamsOf(o).has(dept))
        };
      })
    });
  }));

  // Lịch sử thay đổi của một dòng lịch qua các lần nạp lại
  router.get('/outages/:id/history', wrap(async (req, res) => {
    await policy.actorOf(req);
    const items = await db.query(`SELECT id, kind, note, prevStart, prevEnd, newStart, newEnd, source, changedAt
      FROM dkct_outage_changes WHERE outageId = ? ORDER BY changedAt DESC, id DESC LIMIT 100`, [req.params.id]);
    res.json({ items });
  }));

  // Khu vực TTĐ mỗi tổ phụ trách (lọc "Chỉ tổ của tôi", báo thay đổi cho tổ trưởng); chỉ admin sửa
  router.get('/team-areas', wrap(async (req, res) => {
    await policy.actorOf(req);
    const rows = await db.query('SELECT department, area FROM dkct_team_areas ORDER BY department, area');
    const byDept = new Map();
    rows.forEach(r => { if (!byDept.has(r.department)) byDept.set(r.department, []); byDept.get(r.department).push(r.area); });
    const departments = await listDepartments();
    const names = [...new Set([...departments.map(d => d.name), ...byDept.keys()])];
    // trạm theo khu vực: tổ phụ trách khu vực (mặc định) và tổ được giao riêng (nếu có)
    const subs = await db.query(`SELECT id, name, transmissionName, teamDepartment FROM dkct_substations
      WHERE active = 1 ORDER BY transmissionName, sortOrder, name`);
    const areaTeams = (sub) => names.filter(n => (byDept.get(n) || []).some(a => sub.transmissionName && areaKey(a) === areaKey(sub.transmissionName)));
    res.json({
      teams: names.map(name => ({ department: name, shortName: departments.find(d => d.name === name)?.shortName || '', areas: byDept.get(name) || [] })),
      options: await areaOptions(db),
      substations: subs.map(s => ({ ...s, teamDepartment: s.teamDepartment || null, areaTeams: areaTeams(s) }))
    });
  }));

  // Giao riêng một trạm cho một tổ (department rỗng = trả về theo khu vực): chỉ admin
  router.put('/team-substations/:id', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    if (!policy.isAdmin(actor)) throw forbidden('Chỉ admin được giao trạm cho tổ.');
    const sub = await db.queryOne('SELECT id, name FROM dkct_substations WHERE id = ?', [req.params.id]);
    if (!sub) return res.status(404).json({ error: 'Không tìm thấy trạm biến áp.' });
    const department = String(req.body?.department || '').trim().slice(0, 191) || null;
    if (department) {
      const known = new Set([...(await listDepartments()).map(d => d.name),
        ...(await db.query('SELECT DISTINCT department FROM dkct_team_areas')).map(r => r.department)]);
      if (!known.has(department)) throw Object.assign(new Error('Tổ không có trong danh sách tổ.'), { status: 400 });
    }
    await db.execute('UPDATE dkct_substations SET teamDepartment = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [department, sub.id]);
    res.json({ id: sub.id, name: sub.name, teamDepartment: department });
  }));

  router.put('/team-areas', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    if (!policy.isAdmin(actor)) throw forbidden('Chỉ admin được đặt khu vực phụ trách của tổ.');
    const department = String(req.body?.department || '').trim().slice(0, 191);
    if (!department) throw Object.assign(new Error('Chọn tổ.'), { status: 400 });
    const areas = [...new Map((Array.isArray(req.body?.areas) ? req.body.areas : [])
      .map(a => String(a || '').trim().slice(0, 191)).filter(a => areaKey(a)).map(a => [areaKey(a), a])).values()].slice(0, 30);
    await db.execute('DELETE FROM dkct_team_areas WHERE department = ?', [department]);
    for (const area of areas) {
      await db.execute('INSERT INTO dkct_team_areas (id, department, area) VALUES (?, ?, ?)', [newId('KV'), department, area]);
    }
    res.json({ department, areas });
  }));

  // Chi tiết một dòng lịch (khung "Lịch cắt điện liên quan" của biên bản KSHT, phương án); lịch dùng chung mọi tổ
  router.get('/outages/:id', wrap(async (req, res) => {
    await policy.actorOf(req);
    await importer.expireMarks();
    const outage = await db.queryOne(`SELECT id, regStart, regEnd, actualStart, actualEnd, location, content, scope,
      registrationUnit, workUnit, status, changeKind, changeNote, changeAt, prevStart, prevEnd FROM dkct_outages WHERE id = ?`, [req.params.id]);
    if (!outage) return res.status(404).json({ error: 'Không tìm thấy dòng lịch.' });
    res.json({ outage });
  }));

  /**
   * Dọn lịch cũ theo khoảng ngày bắt đầu (from bỏ trống = từ đầu): chỉ admin (lịch dùng chung mọi tổ).
   * Giữ các dòng đã có hồ sơ gắn để hồ sơ không mất liên kết; lịch sử thay đổi của dòng bị xóa xóa theo.
   */
  async function purgeRange(req) {
    const actor = await policy.actorOf(req);
    if (!policy.isAdmin(actor)) throw forbidden('Chỉ admin được dọn lịch cắt điện cũ.');
    const src = req.method === 'GET' ? req.query : req.body || {};
    const from = src.from ? isoDate(src.from) : null;
    const to = isoDate(src.to);
    if (!to || (src.from && !from) || (from && from > to)) throw Object.assign(new Error('Chọn đến ngày (và từ ngày nếu cần, từ ngày ≤ đến ngày).'), { status: 400 });
    const where = ['o.regStart <= ?'];
    const params = [`${to}T23:59`];
    if (from) { where.unshift('o.regStart >= ?'); params.unshift(`${from}T00:00`); }
    const rows = await db.query(`SELECT o.id, ${LINKED_SQL} AS linked FROM dkct_outages o WHERE ${where.join(' AND ')}`, params);
    const linked = rows.filter(r => Number(r.linked) === 1 || r.linked === true);
    return { from, to, rows, linked, ids: rows.filter(r => !linked.includes(r)).map(r => r.id) };
  }

  router.get('/outages/purge/preview', wrap(async (req, res) => {
    const { from, to, rows, linked, ids } = await purgeRange(req);
    res.json({ from, to, total: rows.length, linked: linked.length, deletable: ids.length });
  }));

  router.post('/outages/purge', wrap(async (req, res) => {
    const { from, to, linked, ids } = await purgeRange(req);
    await executeIn(db, 'DELETE FROM dkct_outage_changes WHERE outageId IN ({in})', ids);
    await executeIn(db, 'DELETE FROM dkct_outages WHERE id IN ({in})', ids);
    res.json({ from, to, deleted: ids.length, kept: linked.length });
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
