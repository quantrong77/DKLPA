/**
 * Công việc không có lịch cắt điện: danh sách/xem/lập/sửa/xóa, giấy ĐKCT nháp từ một công việc.
 * (Biên bản KSHT nháp: GET /works/:id/survey-draft trong surveys.js; phương án nháp: /works/:id/plan-draft trong plans.js.)
 * Công việc thuộc tổ lập; quyền giống giấy ĐKCT: trưởng/phó tổ, trưởng phòng, admin lập; người lập hoặc lãnh đạo tổ sửa.
 */
const express = require('express');
const { newId } = require('../schema');
const { forbidden } = require('../policy');
const { draftFromOutage } = require('../services/registration');
const { normalizeWork, workAsOutage, placeOf, loadVisibleWork, DEFAULT_SCOPE } = require('../services/work');
const { likePattern, LIKE } = require('../util');

// số hồ sơ đã lập từ công việc (hiện "đã có n" trên nút lập)
const COUNTS = `(SELECT COUNT(*) FROM dkct_surveys s WHERE s.workId = w.id) AS surveyCount,
  (SELECT COUNT(*) FROM dkct_plans p WHERE p.workId = w.id) AS planCount,
  (SELECT COUNT(*) FROM dkct_registrations r WHERE r.workId = w.id) AS registrationCount`;
const COLUMNS = 'w.id, w.department, w.content, w.stationName, w.substationId, w.location, w.scope, w.startTime, w.endTime, w.note, w.createdBy, w.createdAt, w.updatedAt';

function workRouter({ db, policy, wrap, buildDraftDefaults }) {
  const router = express.Router();

  const present = async (row, actor, canEdit = policy.canEdit) => ({
    ...row,
    surveyCount: Number(row.surveyCount) || 0,
    planCount: Number(row.planCount) || 0,
    registrationCount: Number(row.registrationCount) || 0,
    canEdit: await canEdit(actor, row)
  });
  const loadRow = (id) => db.queryOne(`SELECT ${COLUMNS}, ${COUNTS} FROM dkct_works w WHERE w.id = ?`, [id]);

  async function normalize(body, res) {
    const substations = await db.query('SELECT id, name FROM dkct_substations');
    const { data, errors } = normalizeWork(body || {}, { substations: new Map(substations.map(s => [s.id, s])) });
    if (errors.length) {
      res.status(422).json({ error: errors[0].message, errors, data });
      return null;
    }
    return data;
  }
  const values = (d) => [d.content, d.stationName, d.substationId, d.location, d.scope, d.startTime, d.endTime, d.note];

  async function loadEditable(req) {
    const actor = await policy.actorOf(req);
    const work = await loadVisibleWork(db, policy, actor, req.params.id);
    if (!(await policy.canEdit(actor, work))) throw forbidden('Chỉ người lập, trưởng/phó đơn vị, trưởng phòng hoặc admin được sửa công việc.');
    return { actor, work };
  }

  router.get('/work-defaults', wrap(async (req, res) => {
    await policy.actorOf(req);
    res.json({ draft: { content: '', substationId: null, stationName: '', location: '', scope: DEFAULT_SCOPE, startTime: null, endTime: null, note: '' } });
  }));

  router.get('/works', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    const where = [];
    const params = [];
    if (!policy.isAdmin(actor)) {
      if (!actor.department) return res.json({ items: [] });
      where.push('w.department = ?');
      params.push(actor.department);
    }
    const year = Number.parseInt(req.query.year, 10);
    // công việc chưa ghi thời gian: xếp theo năm lập
    if (year) { where.push("(w.startTime LIKE ? OR (w.startTime IS NULL AND w.createdAt >= ? AND w.createdAt < ?))"); params.push(`${year}-%`, `${year}-01-01`, `${year + 1}-01-01`); }
    const search = String(req.query.search || '').trim();
    if (search) {
      where.push(`(w.content ${LIKE} OR w.stationName ${LIKE} OR w.location ${LIKE})`);
      params.push(...Array(3).fill(likePattern(search)));
    }
    const rows = await db.query(`SELECT ${COLUMNS}, ${COUNTS} FROM dkct_works w ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY w.startTime DESC, w.createdAt DESC LIMIT 500`, params);
    const items = [];
    const canEdit = policy.editChecker();
    for (const row of rows) items.push(await present(row, actor, canEdit));
    res.json({ items });
  }));

  router.get('/works/:id', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    await loadVisibleWork(db, policy, actor, req.params.id);
    res.json({ work: await present(await loadRow(req.params.id), actor) });
  }));

  router.post('/works', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    if (!(await policy.canCreate(actor))) throw forbidden('Chỉ trưởng/phó đơn vị, trưởng phòng hoặc admin được thêm công việc.');
    const data = await normalize(req.body, res);
    if (!data) return;
    const id = newId('CV');
    await db.execute(`INSERT INTO dkct_works (id, department, content, stationName, substationId, location, scope, startTime, endTime, note,
      createdBy, updatedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, actor.department || '', ...values(data), actor.id, actor.id]);
    res.status(201).json({ work: await present(await loadRow(id), actor) });
  }));

  router.put('/works/:id', wrap(async (req, res) => {
    const { actor, work } = await loadEditable(req);
    const data = await normalize(req.body, res);
    if (!data) return;
    await db.execute(`UPDATE dkct_works SET content = ?, stationName = ?, substationId = ?, location = ?, scope = ?, startTime = ?, endTime = ?,
      note = ?, updatedBy = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [...values(data), actor.id, work.id]);
    res.json({ work: await present(await loadRow(work.id), actor) });
  }));

  // đã có hồ sơ lập từ công việc: không xóa (hồ sơ sẽ mất gốc của luồng)
  router.delete('/works/:id', wrap(async (req, res) => {
    const { work } = await loadEditable(req);
    const row = await loadRow(work.id);
    const used = Number(row.surveyCount) + Number(row.planCount) + Number(row.registrationCount);
    if (used > 0) return res.status(409).json({ error: 'Công việc này đã có biên bản/phương án/giấy ĐKCT, không xóa được.' });
    await db.execute('DELETE FROM dkct_works WHERE id = ?', [work.id]);
    res.json({ success: true });
  }));

  // giấy ĐKCT nháp: nội dung, địa điểm, điều kiện, thời gian lấy từ công việc
  router.get('/works/:id/draft', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    const work = await loadVisibleWork(db, policy, actor, req.params.id);
    const defaults = await buildDraftDefaults(actor);
    const base = draftFromOutage(workAsOutage(work));
    res.json({
      draft: {
        ...defaults,
        ...base,
        outageId: null,
        workId: work.id,
        workContent: { ...base.workContent, source: 'manual' },
        workLocation: placeOf(work),
        condition: { ...base.condition, source: 'manual' },
        time: { ...base.time, source: 'manual' },
        risks: defaults.risks
      }
    });
  }));

  return router;
}

module.exports = { workRouter };
