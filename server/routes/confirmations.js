/**
 * Giấy xác nhận đủ điều kiện đóng điện: danh sách/xem/lập/sửa/xóa, xuất DOCX theo mẫu,
 * số "<n>/GXN-<tổ>" đếm riêng theo tổ và năm. Lập từ giấy ĐKCT: GET /registrations/:id/confirmation-draft;
 * từ dòng lịch cắt điện: GET /outages/:id/confirmation-draft.
 * Quyền giống giấy ĐKCT.
 */
const express = require('express');
const { docxFileName, attachment } = require('../services/fileName');
const { newId, sameUnitName } = require('../schema');
const { forbidden } = require('../policy');
const { normalizeConfirmation, confirmationFromRegistration, devicesIn } = require('../services/confirmation');
const { renderConfirmationDocx } = require('../services/confirmationRender');
const { createNumbering, formatConfirmationNumber } = require('../services/numbering');
const { vnYear, vnToday } = require('../services/clock');
const { likePattern, LIKE, safeParse, sendPreview, previewNumber } = require('../util');

const LIST_COLUMNS = 'id, docNumber, docYear, department, stationName, bays, workDate, substationId, registrationId, planId, createdBy, createdAt, updatedAt';

function confirmationRouter({ db, policy, wrap, getProfile, getUnit, defaultUnitName, templates, orgNames }) {
  const router = express.Router();
  const numbering = createNumbering(db, undefined, { table: 'dkct_confirmations', prefix: 'GXN:' });
  const notFound = (message) => Object.assign(new Error(message), { status: 404 });

  const present = async (row, actor, canEdit = policy.canEdit) => ({
    ...row,
    data: row.data === undefined ? undefined : safeParse(row.data),
    canEdit: await canEdit(actor, row)
  });

  async function loadVisible(req, columns = '*') {
    const actor = await policy.actorOf(req);
    const row = await db.queryOne(`SELECT ${columns} FROM dkct_confirmations WHERE id = ?`, [req.params.id]);
    if (!row) throw notFound('Không tìm thấy giấy xác nhận.');
    if (!policy.canView(actor, row)) throw forbidden('Giấy xác nhận này thuộc tổ khác.');
    return { actor, row };
  }

  const loadSubstations = () => db.query('SELECT id, name, stationId, active FROM dkct_substations');

  async function normalize(body, res) {
    const substations = await loadSubstations();
    const { data, errors } = normalizeConfirmation(body || {}, { substations: new Map(substations.map(s => [s.id, s])) });
    if (errors.length) {
      res.status(422).json({ error: errors[0].message, errors, data });
      return null;
    }
    // chỉ giữ liên kết tới giấy ĐKCT/phương án còn tồn tại (khóa ngoại)
    if (data.registrationId && !(await db.queryOne('SELECT id FROM dkct_registrations WHERE id = ?', [data.registrationId]))) data.registrationId = null;
    if (data.planId && !(await db.queryOne('SELECT id FROM dkct_plans WHERE id = ?', [data.planId]))) data.planId = null;
    return data;
  }

  const summary = (data) => [data.station.name.slice(0, 255), data.bays.slice(0, 2000), data.workDate,
    data.station.substationId, data.registrationId, data.planId];

  async function numberingInfo(actor) {
    const unit = await getUnit(actor.id);
    const year = vnYear();
    const state = await numbering.peek(unit.department, year);
    return { department: unit.department, year, ...state, preview: formatConfirmationNumber(state.nextNumber, unit.shortName) };
  }

  /** Giấy mới: tổ, người ký theo người đăng nhập; công ty, địa danh theo giấy gần nhất của tổ. */
  async function buildDefaults(actor) {
    const [profile, unit, last] = await Promise.all([
      getProfile(actor.id),
      getUnit(actor.id).catch(() => null),
      db.queryOne('SELECT data FROM dkct_confirmations WHERE department = ? ORDER BY createdAt DESC LIMIT 1', [actor.department || ''])
    ]);
    const lh = ((last && safeParse(last.data)) || {}).header || {};
    const { companyName, unitName } = await orgNames.headerNames(lh, defaultUnitName);
    return {
      header: {
        companyName,
        unitName,
        teamName: actor.department || '',
        teamShort: unit?.shortName || '',
        place: lh.place || '',
        date: vnToday()
      },
      station: { substationId: null, name: '' },
      bays: '',
      workDate: vnToday(),
      workObject: '',
      items: [{ text: '', result: 'đạt' }],
      equipment: '',
      note: '',
      signer: profile?.fullName || '',
      registrationId: null,
      planId: null
    };
  }

  router.get('/confirmation-defaults', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    res.json({ draft: await buildDefaults(actor), numbering: await numberingInfo(actor) });
  }));

  /** TBA trong danh mục: theo trạm đã chọn, không thì khớp tên với địa điểm (lịch cắt điện, công việc, giấy). */
  async function matchSubstation(places, substationId) {
    const substations = (await loadSubstations()).filter(s => s.active);
    return substations.find(s => substationId && s.id === substationId)
      || substations.find(s => places.some(p => sameUnitName(s.name, p)))
      || substations.find(s => places.some(p => String(p).toLocaleLowerCase('vi').includes(String(s.name).replace(/^TBA\s+/i, '').toLocaleLowerCase('vi'))))
      || null;
  }

  const isoDate = (v, fallback) => {
    const d = String(v || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : fallback;
  };

  // Lập từ giấy ĐKCT: trạm theo lịch cắt điện (hoặc địa điểm), ngăn lộ/thiết bị/mục kết quả theo nội dung, tổ và người ký theo giấy
  async function draftFromRegistration(actor, reg) {
    const data = safeParse(reg.data);
    const outage = reg.outageId ? await db.queryOne('SELECT location, regEnd FROM dkct_outages WHERE id = ?', [reg.outageId]) : null;
    // công việc không có lịch cắt điện: trạm đã chọn trong danh mục
    const work = reg.workId ? await db.queryOne('SELECT substationId, stationName, endTime FROM dkct_works WHERE id = ?', [reg.workId]) : null;
    const sub = await matchSubstation([outage?.location, work?.stationName, data.workLocation].filter(Boolean), work?.substationId);
    const draft = await buildDefaults(actor);
    const from = confirmationFromRegistration({ id: reg.id, data }, sub);
    return {
      ...draft,
      ...from,
      planId: reg.planId || null, // giấy lập từ phương án: lấy hạng mục từ phương án đó
      header: { ...draft.header, teamName: from.team.teamName || draft.header.teamName, unitName: from.team.unitName || draft.header.unitName },
      // ngày thực hiện: ngày kết thúc công tác theo giấy (nếu có), không thì hôm nay
      workDate: isoDate(data.time?.end || outage?.regEnd || work?.endTime, draft.workDate),
      signer: from.signer || draft.signer,
      team: undefined
    };
  }

  router.get('/registrations/:id/confirmation-draft', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    const reg = await db.queryOne('SELECT id, department, outageId, workId, planId, data FROM dkct_registrations WHERE id = ?', [req.params.id]);
    if (!reg) throw notFound('Không tìm thấy giấy ĐKCT.');
    if (!policy.canView(actor, reg)) throw forbidden('Giấy ĐKCT này thuộc tổ khác.');
    res.json({ draft: await draftFromRegistration(actor, reg) });
  }));

  // Lập từ một dòng lịch cắt điện: có giấy ĐKCT của tổ cho dòng lịch thì lập theo giấy mới nhất;
  // chưa có thì theo chính dòng lịch (trạm theo địa điểm, ngăn lộ/mục kết quả theo nội dung) và phương án mới nhất của tổ
  router.get('/outages/:id/confirmation-draft', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    const outage = await db.queryOne('SELECT id, location, content, scope, regEnd FROM dkct_outages WHERE id = ?', [req.params.id]);
    if (!outage) throw notFound('Không tìm thấy dòng lịch.');
    const dept = actor.department || '';
    const reg = await db.queryOne(`SELECT id, department, outageId, workId, planId, data FROM dkct_registrations
      WHERE outageId = ? AND department = ? ORDER BY createdAt DESC LIMIT 1`, [outage.id, dept]);
    if (reg) return res.json({ draft: await draftFromRegistration(actor, reg) });
    const plan = await db.queryOne('SELECT id FROM dkct_plans WHERE outageId = ? AND department = ? ORDER BY createdAt DESC LIMIT 1', [outage.id, dept]);
    const draft = await buildDefaults(actor);
    const from = confirmationFromRegistration({ id: null, data: { workContent: { text: outage.content }, workLocation: outage.location } },
      await matchSubstation([outage.location].filter(Boolean)));
    // nội dung không ghi thiết bị: lấy theo phạm vi cắt điện
    const devices = from.bays || devicesIn(outage.scope).join(', ');
    res.json({
      draft: {
        ...draft,
        ...from,
        bays: devices,
        workObject: from.bays ? from.workObject : devices || from.workObject,
        equipment: from.bays ? from.equipment : devices || from.equipment,
        planId: plan?.id || null,
        workDate: isoDate(outage.regEnd, draft.workDate),
        team: undefined
      }
    });
  }));

  router.get('/confirmation-numbering', wrap(async (req, res) => {
    res.json({ numbering: await numberingInfo(await policy.actorOf(req)) });
  }));

  router.put('/confirmation-numbering', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    if (!(await policy.canCreate(actor))) throw forbidden('Chỉ trưởng/phó tổ, trưởng phòng hoặc admin được đặt số khởi đầu.');
    const unit = await getUnit(actor.id);
    await numbering.setStartNumber(unit.department, vnYear(), req.body?.startNumber, actor.id);
    res.json({ numbering: await numberingInfo(actor) });
  }));

  router.get('/confirmations', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    const where = [];
    const params = [];
    if (!policy.isAdmin(actor)) {
      if (!actor.department) return res.json({ items: [] });
      where.push('department = ?');
      params.push(actor.department);
    }
    const year = Number.parseInt(req.query.year, 10);
    if (year) { where.push('docYear = ?'); params.push(year); }
    const search = String(req.query.search || '').trim();
    if (search) {
      where.push(`(docNumber ${LIKE} OR stationName ${LIKE} OR bays ${LIKE})`);
      params.push(...Array(3).fill(likePattern(search)));
    }
    const rows = await db.query(`SELECT ${LIST_COLUMNS} FROM dkct_confirmations ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY docYear DESC, docSeq DESC LIMIT 500`, params);
    const items = [];
    const canEdit = policy.editChecker();
    for (const row of rows) items.push(await present(row, actor, canEdit));
    res.json({ items });
  }));

  router.get('/confirmations/:id', wrap(async (req, res) => {
    const { actor, row } = await loadVisible(req, `${LIST_COLUMNS}, data`);
    res.json({ confirmation: await present(row, actor) });
  }));

  router.post('/confirmations', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    if (!(await policy.canCreate(actor))) throw forbidden('Chỉ trưởng/phó tổ, trưởng phòng hoặc admin được lập giấy xác nhận.');
    const data = await normalize(req.body, res);
    if (!data) return;
    const unit = await getUnit(actor.id);
    const year = vnYear();
    const seq = await numbering.takeNext(unit.department, year);
    const id = newId('XN');
    await db.execute(`
      INSERT INTO dkct_confirmations (id, docSeq, docYear, docDepartment, docNumber, department, stationName, bays, workDate,
        substationId, registrationId, planId, data, createdBy, updatedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, seq, year, unit.department, formatConfirmationNumber(seq, unit.shortName), actor.department || unit.department,
      ...summary(data), JSON.stringify(data), actor.id, actor.id]);
    const row = await db.queryOne(`SELECT ${LIST_COLUMNS}, data FROM dkct_confirmations WHERE id = ?`, [id]);
    res.status(201).json({ confirmation: await present(row, actor) });
  }));

  router.put('/confirmations/:id', wrap(async (req, res) => {
    const { actor, row } = await loadVisible(req, LIST_COLUMNS);
    if (!(await policy.canEdit(actor, row))) throw forbidden('Chỉ người lập, trưởng/phó tổ, trưởng phòng hoặc admin được sửa giấy xác nhận.');
    const data = await normalize(req.body, res);
    if (!data) return;
    await db.execute(`
      UPDATE dkct_confirmations SET stationName = ?, bays = ?, workDate = ?, substationId = ?, registrationId = ?, planId = ?,
        data = ?, updatedBy = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    [...summary(data), JSON.stringify(data), actor.id, row.id]);
    const updated = await db.queryOne(`SELECT ${LIST_COLUMNS}, data FROM dkct_confirmations WHERE id = ?`, [row.id]);
    res.json({ confirmation: await present(updated, actor) });
  }));

  router.delete('/confirmations/:id', wrap(async (req, res) => {
    const { actor, row } = await loadVisible(req, LIST_COLUMNS);
    if (!(await policy.canEdit(actor, row))) throw forbidden('Chỉ người lập, trưởng/phó tổ, trưởng phòng hoặc admin được xóa giấy xác nhận.');
    await db.execute('DELETE FROM dkct_confirmations WHERE id = ?', [row.id]);
    res.json({ success: true });
  }));

  // Xem trước bản Word từ dữ liệu đang soạn (chưa lưu): không cấp số, không ghi gì
  router.post('/confirmations/preview', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    if (!(await policy.canCreate(actor))) throw forbidden('Chỉ trưởng/phó tổ, trưởng phòng hoặc admin được lập giấy xác nhận.');
    const data = await normalize(req.body, res);
    if (!data) return;
    sendPreview(res, await templates.render('confirmation', (tpl) => renderConfirmationDocx({ docNumber: previewNumber(null, req.query), data }, tpl)));
  }));

  router.post('/confirmations/:id/preview', wrap(async (req, res) => {
    const { actor, row } = await loadVisible(req, LIST_COLUMNS);
    if (!(await policy.canEdit(actor, row))) throw forbidden('Chỉ người lập, trưởng/phó tổ, trưởng phòng hoặc admin được sửa giấy xác nhận.');
    const data = await normalize(req.body, res);
    if (!data) return;
    sendPreview(res, await templates.render('confirmation', (tpl) => renderConfirmationDocx({ docNumber: row.docNumber, data }, tpl)));
  }));

  router.get('/confirmations/:id/docx', wrap(async (req, res) => {
    const { row } = await loadVisible(req);
    const data = safeParse(row.data);
    const buffer = await templates.render('confirmation', (tpl) => renderConfirmationDocx({ docNumber: row.docNumber, data }, tpl));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', attachment(docxFileName('confirmation', {
      date: data.workDate || data.header?.date, number: row.docNumber, bays: data.bays, bayText: data.equipment, station: data.station?.name
    })));
    res.send(buffer);
  }));

  return router;
}

module.exports = { confirmationRouter };
