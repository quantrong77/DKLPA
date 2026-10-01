/**
 * Giấy ĐKCT: danh sách/xem/lập/sửa/xóa, xuất DOCX theo mẫu, số giấy theo tổ và năm.
 * Dữ liệu giấy có cấu trúc lưu ở cột JSON `data` (bản chụp nhân sự, ĐVCT, đề cử, cấp phiếu, rủi ro);
 * vài cột tóm tắt (workContent, startTime, recipientName) phục vụ danh sách và tìm kiếm.
 */
const express = require('express');
const { docxFileName, attachment } = require('../services/fileName');
const { newId } = require('../schema');
const { forbidden } = require('../policy');
const { normalizeRegistration } = require('../services/registration');
const { renderRegistrationDocx } = require('../services/docxRender');
const { formatNumber } = require('../services/numbering');
const { vnYear } = require('../services/clock');
const { likePattern, LIKE, safeParse, sendPreview, previewNumber } = require('../util');

const toMap = (rows) => new Map(rows.map(r => [r.id, r]));

function registrationRouter({ db, policy, wrap, numbering, getUnit, buildDraftDefaults, listDepartments }) {
  const router = express.Router();

  const present = async (row, actor) => ({
    id: row.id,
    docNumber: row.docNumber,
    docYear: row.docYear,
    department: row.department,
    outageId: row.outageId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    data: safeParse(row.data),
    canEdit: await policy.canEdit(actor, row)
  });

  async function loadVisible(req) {
    const actor = await policy.actorOf(req);
    const row = await db.queryOne('SELECT * FROM dkct_registrations WHERE id = ?', [req.params.id]);
    if (!row) throw Object.assign(new Error('Không tìm thấy giấy đăng ký công tác.'), { status: 404 });
    if (!policy.canView(actor, row)) throw forbidden('Giấy đăng ký công tác này thuộc tổ khác.');
    return { actor, row };
  }

  async function normalize(body, res) {
    const [personnel, stations] = await Promise.all([
      db.query('SELECT * FROM dkct_personnel'),
      db.query('SELECT * FROM dkct_stations')
    ]);
    const { data, errors } = normalizeRegistration(body || {}, { personnel: toMap(personnel), stations: toMap(stations) });
    if (errors.length) {
      res.status(422).json({ error: errors[0].message, errors, data });
      return null;
    }
    // chỉ giữ liên kết tới dòng lịch còn tồn tại
    if (data.outageId && !(await db.queryOne('SELECT id FROM dkct_outages WHERE id = ?', [data.outageId]))) data.outageId = null;
    return data;
  }

  const summary = (data) => [data.workContent.text.slice(0, 2000), data.time.start, data.time.end, data.recipient.name, data.outageId];

  async function numberingInfo(actor) {
    const unit = await getUnit(actor.id);
    const year = vnYear();
    const state = await numbering.peek(unit.department, year);
    return { department: unit.department, year, ...state, preview: formatNumber(state.nextNumber, unit.shortName), canConfigure: await policy.canCreate(actor) };
  }

  router.get('/meta', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    res.json({
      permissions: { canCreate: await policy.canCreate(actor), canManageCatalog: await policy.canManageCatalog(actor), isAdmin: !!policy.isAdmin(actor) },
      defaults: await buildDraftDefaults(actor),
      departments: await listDepartments(),
      numbering: await numberingInfo(actor)
    });
  }));

  router.get('/numbering', wrap(async (req, res) => {
    res.json({ numbering: await numberingInfo(await policy.actorOf(req)) });
  }));

  router.put('/numbering', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    if (!(await policy.canCreate(actor))) throw forbidden('Chỉ trưởng/phó tổ, trưởng phòng hoặc admin được đặt số khởi đầu.');
    const unit = await getUnit(actor.id);
    await numbering.setStartNumber(unit.department, vnYear(), req.body?.startNumber, actor.id);
    res.json({ numbering: await numberingInfo(actor) });
  }));

  router.get('/registrations', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    const where = [];
    const params = [];
    if (!policy.isAdmin(actor)) {
      if (!actor.department) return res.json({ items: [] }); // chưa thuộc tổ nào thì không thấy giấy nào
      where.push('department = ?');
      params.push(actor.department);
    }
    const year = Number.parseInt(req.query.year, 10);
    if (year) { where.push('docYear = ?'); params.push(year); }
    if (req.query.outageId) { where.push('outageId = ?'); params.push(String(req.query.outageId)); }
    const search = String(req.query.search || '').trim();
    if (search) {
      where.push(`(docNumber ${LIKE} OR workContent ${LIKE} OR recipientName ${LIKE})`);
      params.push(...Array(3).fill(likePattern(search)));
    }
    const rows = await db.query(`
      SELECT id, docNumber, docYear, department, outageId, workContent, startTime, endTime, recipientName, createdBy, createdAt, updatedAt
      FROM dkct_registrations ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY docYear DESC, docSeq DESC LIMIT 500`, params);
    // quyền sửa theo tổ chỉ phụ thuộc (người lập, tổ): tính một lần cho mỗi tổ
    const byDepartment = new Map();
    const items = [];
    for (const row of rows) {
      let canEdit = row.createdBy === actor.id;
      if (!canEdit) {
        if (!byDepartment.has(row.department)) byDepartment.set(row.department, await policy.canEdit(actor, { ...row, createdBy: null }));
        canEdit = byDepartment.get(row.department);
      }
      items.push({ ...row, canEdit });
    }
    res.json({ items });
  }));

  router.get('/registrations/:id', wrap(async (req, res) => {
    const { actor, row } = await loadVisible(req);
    res.json({ registration: await present(row, actor) });
  }));

  router.post('/registrations', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    if (!(await policy.canCreate(actor))) throw forbidden('Chỉ trưởng/phó tổ, trưởng phòng hoặc admin được lập giấy đăng ký công tác.');
    const data = await normalize(req.body, res);
    if (!data) return;
    const unit = await getUnit(actor.id);
    const year = vnYear();
    const seq = await numbering.takeNext(unit.department, year);
    const id = newId('DKCT');
    await db.execute(`
      INSERT INTO dkct_registrations (id, docSeq, docYear, docDepartment, docNumber, department, workContent, startTime, endTime,
        recipientName, outageId, data, createdBy, updatedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, seq, year, unit.department, formatNumber(seq, unit.shortName), actor.department || unit.department,
      ...summary(data), JSON.stringify(data), actor.id, actor.id]);
    const row = await db.queryOne('SELECT * FROM dkct_registrations WHERE id = ?', [id]);
    res.status(201).json({ registration: await present(row, actor) });
  }));

  router.put('/registrations/:id', wrap(async (req, res) => {
    const { actor, row } = await loadVisible(req);
    if (!(await policy.canEdit(actor, row))) throw forbidden('Chỉ người lập giấy, trưởng/phó tổ, trưởng phòng hoặc admin được sửa.');
    const data = await normalize(req.body, res);
    if (!data) return;
    await db.execute(`
      UPDATE dkct_registrations SET workContent = ?, startTime = ?, endTime = ?, recipientName = ?, outageId = ?,
        data = ?, updatedBy = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    [...summary(data), JSON.stringify(data), actor.id, row.id]);
    const updated = await db.queryOne('SELECT * FROM dkct_registrations WHERE id = ?', [row.id]);
    res.json({ registration: await present(updated, actor) });
  }));

  router.delete('/registrations/:id', wrap(async (req, res) => {
    const { actor, row } = await loadVisible(req);
    if (!(await policy.canEdit(actor, row))) throw forbidden('Chỉ người lập giấy, trưởng/phó tổ, trưởng phòng hoặc admin được xóa.');
    await db.execute('DELETE FROM dkct_registrations WHERE id = ?', [row.id]);
    res.json({ success: true });
  }));

  // Xem trước bản Word từ dữ liệu đang soạn (chưa lưu): không cấp số, không ghi gì
  router.post('/registrations/preview', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    if (!(await policy.canCreate(actor))) throw forbidden('Chỉ trưởng/phó tổ, trưởng phòng hoặc admin được lập giấy đăng ký công tác.');
    const data = await normalize(req.body, res);
    if (!data) return;
    sendPreview(res, renderRegistrationDocx({ docNumber: previewNumber(null, req.query), data }));
  }));

  router.post('/registrations/:id/preview', wrap(async (req, res) => {
    const { actor, row } = await loadVisible(req);
    if (!(await policy.canEdit(actor, row))) throw forbidden('Chỉ người lập giấy, trưởng/phó tổ, trưởng phòng hoặc admin được sửa.');
    const data = await normalize(req.body, res);
    if (!data) return;
    sendPreview(res, renderRegistrationDocx({ docNumber: row.docNumber, data }));
  }));

  router.get('/registrations/:id/docx', wrap(async (req, res) => {
    const { row } = await loadVisible(req);
    const data = safeParse(row.data);
    const buffer = renderRegistrationDocx({ docNumber: row.docNumber, data });
    const name = docxFileName('registration', {
      date: data.header?.date || data.time?.start, number: row.docNumber, bayText: data.workContent?.text, station: data.workLocation
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', attachment(name));
    res.send(buffer);
  }));

  return router;
}

module.exports = { registrationRouter };
