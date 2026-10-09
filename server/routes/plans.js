/**
 * Phương án thi công, biện pháp an toàn (thí nghiệm): danh sách/xem/lập/sửa/xóa, xuất DOCX theo mẫu,
 * số "<n>/PA-<tổ>.<hậu tố>" đếm riêng theo tổ và năm. Danh mục hạng mục QĐ 1901 cho Bảng 1: GET /tests1901.
 * Quyền giống giấy ĐKCT.
 */
const express = require('express');
const { attachOutageChanges } = require('../services/outageChange');
const { docxFileName, attachment } = require('../services/fileName');
const { newId, sameUnitName } = require('../schema');
const { forbidden } = require('../policy');
const { normalizePlan, baysFromScope } = require('../services/plan');
const { libraryBlockStatus } = require('./ctLibrary');
const { renderPlanDocx } = require('../services/planRender');
const { createNumbering, formatPlanNumber } = require('../services/numbering');
const { createPlaces, DEFAULT_PLACE } = require('../services/places');
const { vnYear, vnToday } = require('../services/clock');
const { likePattern, LIKE, safeParse, sendPreview, previewNumber } = require('../util');
const TESTS_1901 = require('../seeds/tests1901.json');
const { loadVisibleWork } = require('../services/work');

const LIST_COLUMNS = 'id, docNumber, docYear, department, workTitle, stationName, startTime, substationId, surveyId, outageId, workId, createdBy, createdAt, updatedAt';
const DEFAULT_LEGAL_BASES = [
  'Căn cứ Quy trình an toàn điện của Tổng Công ty Truyền tải điện Quốc gia ban hành theo quyết định số 726/QĐ-EVNNPT, ngày 22 tháng 5 năm 2026;',
  'Căn cứ Quy định công tác an toàn điện trong Tổng Công ty Truyền tải điện Quốc gia ban hành theo quyết định số 728/QĐ-EVNNPT, ngày 22 tháng 5 năm 2026;',
  'Căn cứ Quy định thí nghiệm, kiểm định an toàn kỹ thuật thiết bị điện trong Tổng Công ty Truyền tải điện Quốc gia ban hành theo Quyết định số 1901/QĐ-EVNNPT ngày 29/9/2025 của Tổng Công ty Truyền tải điện Quốc gia [1901];',
  'Căn cứ qui trình vận hành, bảo trì - bảo dưỡng của từng thiết bị;',
  'Căn cứ tài liệu hướng dẫn của nhà chế tạo.'
];
const DEFAULT_INSTRUMENTS = [
  ['Nhất thứ', 'Máy phân tích cuộn dây máy biến áp W2293', 'Máy', '01'],
  ['Nhất thứ', 'Hợp bộ thí nghiệm nhất thứ CPC 100', 'Bộ', '01'],
  ['Nhất thứ', 'Máy phân tích cách điện DOBLE-M4100', 'Máy', '01'],
  ['Nhất thứ', 'Megger Kyoritsu 5000V', 'Máy', '01'],
  ['Nhất thứ', 'Megger Kyoritsu 2500V', 'Máy', '02'],
  ['Nhất thứ', 'Thiết bị chụp sóng máy cắt TM1800', 'Máy', '01'],
  ['Nhất thứ', 'Máy đo độ ẩm khí SF6', 'Máy', '01'],
  ['Nhất thứ', 'Máy đo điện trở tiếp xúc AUTO-OHM 200', 'Máy', '01'],
  ['Nhất thứ', 'Máy kiểm tra thiết bị đếm sét SCM-SMART TESTER', 'Máy', '01'],
  ['Nhất thứ', 'VOM Fluke 40+', 'Cái', '02'],
  ['Nhất thứ', 'Ampe kìm KTS Fluke', 'Cái', '01'],
  ['Nhất thứ', 'Nhiệt kế', 'Cái', '01'],
  ['Nhất thứ', 'Rulo nguồn', 'Cái', '02'],
  ['Thiết bị nâng', 'Xe chở người 16C', 'Xe', '01']
].map(([group, name, unit, qty]) => ({ group, name, unit, qty, note: '' }));

function planRouter({ db, policy, wrap, getProfile, getUnit, defaultUnitName, templates }) {
  const router = express.Router();
  const numbering = createNumbering(db, undefined, { table: 'dkct_plans', prefix: 'PA:' });
  const places = createPlaces(db);

  const present = async (row, actor) => ({
    ...row,
    data: row.data === undefined ? undefined : safeParse(row.data),
    canEdit: await policy.canEdit(actor, row)
  });

  async function loadVisible(req, columns = '*') {
    const actor = await policy.actorOf(req);
    const row = await db.queryOne(`SELECT ${columns} FROM dkct_plans WHERE id = ?`, [req.params.id]);
    if (!row) throw Object.assign(new Error('Không tìm thấy phương án.'), { status: 404 });
    if (!policy.canView(actor, row)) throw forbidden('Phương án này thuộc tổ khác.');
    return { actor, row };
  }

  const loadSubstations = () => db.query(`SELECT s.id, s.name, s.stationId, s.active, u.name AS unitName, u.shortName AS unitShort
    FROM dkct_substations s JOIN dkct_stations u ON u.id = s.stationId`);

  async function normalize(body, res) {
    const [personnel, substations] = await Promise.all([db.query('SELECT * FROM dkct_personnel'), loadSubstations()]);
    const { data, errors } = normalizePlan(body || {}, {
      personnel: new Map(personnel.map(p => [p.id, p])),
      substations: new Map(substations.map(s => [s.id, s]))
    });
    if (errors.length) {
      res.status(422).json({ error: errors[0].message, errors, data });
      return null;
    }
    // chỉ giữ liên kết tới biên bản/lịch còn tồn tại (khóa ngoại)
    if (data.surveyId && !(await db.queryOne('SELECT id FROM dkct_surveys WHERE id = ?', [data.surveyId]))) data.surveyId = null;
    if (data.outageId && !(await db.queryOne('SELECT id FROM dkct_outages WHERE id = ?', [data.outageId]))) data.outageId = null;
    if (data.workId && !(await db.queryOne('SELECT id FROM dkct_works WHERE id = ?', [data.workId]))) data.workId = null;
    // bảng mạch dòng từ thư viện: "đã xác nhận" do máy chủ đối chiếu thư viện, không lấy theo dữ liệu gửi lên
    for (const b of data.ctBlocks) if (b.ctId) b.status = await libraryBlockStatus(db, b);
    return data;
  }

  /** Ảnh các sơ đồ trạm in ở Phụ lục IV, cấp điện áp cao trước (drawingIds null: mọi sơ đồ của trạm). */
  async function drawingsFor(data) {
    if (!data.station?.substationId) return [];
    const rows = await db.query('SELECT id, label, image FROM dkct_drawings WHERE substationId = ? ORDER BY sortOrder, label',
      [data.station.substationId]);
    const picked = Array.isArray(data.drawingIds) ? rows.filter(r => data.drawingIds.includes(r.id)) : rows;
    return picked.map(r => ({ label: r.label, buffer: Buffer.from(r.image) }));
  }

  const summary = (data, workTitle) => [workTitle.slice(0, 2000), data.station.name.slice(0, 255), data.time.start,
    data.station.substationId, data.surveyId, data.outageId, data.workId];
  const titleOf = (data) => [`${data.workType} năm ${data.year || ''}`.trim(), data.equipmentText].join(' ');

  async function numberingInfo(actor, suffix = 'Nhatthu') {
    const unit = await getUnit(actor.id);
    const year = vnYear();
    const state = await numbering.peek(unit.department, year);
    return { department: unit.department, year, ...state, preview: formatPlanNumber(state.nextNumber, unit.shortName, suffix) };
  }

  /** Phương án mới: tổ, người lập theo người đăng nhập; đầu văn bản theo phương án gần nhất của tổ. */
  async function buildPlanDefaults(actor) {
    const [profile, unit, last] = await Promise.all([
      getProfile(actor.id),
      getUnit(actor.id).catch(() => null),
      db.queryOne('SELECT data FROM dkct_plans WHERE department = ? ORDER BY createdAt DESC LIMIT 1', [actor.department || ''])
    ]);
    const lastData = (last && safeParse(last.data)) || {};
    const lh = lastData.header || {};
    const teamShort = unit?.shortName || '';
    return {
      header: {
        companyName: lh.companyName || 'Công ty Truyền tải điện 3',
        unitName: lh.unitName || defaultUnitName,
        teamName: actor.department || '',
        teamShort,
        transmissionName: lh.transmissionName || '',
        place: DEFAULT_PLACE,
        date: vnToday(),
        numberSuffix: lh.numberSuffix || 'Nhatthu'
      },
      workType: 'Thí nghiệm định kỳ',
      year: vnYear() + 1,
      equipmentText: '',
      bays: '',
      station: { substationId: null, name: '', qlvhUnitId: null, qlvhUnitName: '', qlvhShort: '' },
      drawingIds: null,  // chưa chọn: giao diện gợi ý theo ngăn lộ khi chọn trạm
      time: { start: null, end: null },
      approvalRef: lastData.approvalRef || '',
      legalBases: lastData.legalBases?.length ? lastData.legalBases : DEFAULT_LEGAL_BASES,
      workloads: [],
      isolationSteps: [],
      testEquipment: [],
      ctIsolation: '',
      liveDisconnectors: '',
      risks: [],
      people: [],
      reserve: 'Không.',
      teamLeader: '',
      recipients: [],
      isolationDevices: [],
      testGroups: [],
      instruments: lastData.instruments?.length ? lastData.instruments : DEFAULT_INSTRUMENTS,
      ctBlocks: [],
      surveyId: null,
      outageId: null,
      workId: null,
      preparedBy: profile?.fullName || ''
    };
  }

  router.get('/tests1901', wrap(async (req, res) => {
    await policy.actorOf(req);
    res.json({ devices: TESTS_1901 });
  }));

  router.get('/plan-defaults', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    res.json({ draft: await buildPlanDefaults(actor), numbering: await numberingInfo(actor) });
  }));

  /** Phương án nháp từ một dòng lịch hoặc công việc: trạm (khớp danh mục), thiết bị, ngăn lộ, thời gian, các bước cô lập. */
  async function planDraftFrom(actor, src, substationId = null) {
    const subs = (await loadSubstations()).filter(s => s.active);
    const sub = subs.find(s => substationId && s.id === substationId) || subs.find(s => sameUnitName(s.name, src.location));
    const draft = await buildPlanDefaults(actor);
    return {
      ...draft,
      equipmentText: src.content || '',
      bays: baysFromScope(src.bays),
      station: sub
        ? { substationId: sub.id, name: sub.name, qlvhUnitId: sub.stationId, qlvhUnitName: sub.unitName, qlvhShort: sub.unitShort || '' }
        : { ...draft.station, name: src.location || '' },
      time: { start: src.start || null, end: src.end || null },
      isolationSteps: src.isolation ? String(src.isolation).split('\n').map(s => s.trim()).filter(Boolean) : []
    };
  }

  router.get('/outages/:id/plan-draft', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    const outage = await db.queryOne('SELECT * FROM dkct_outages WHERE id = ?', [req.params.id]);
    if (!outage) return res.status(404).json({ error: 'Không tìm thấy dòng lịch.' });
    const draft = await planDraftFrom(actor, {
      content: outage.content, location: outage.location, bays: outage.scope, start: outage.regStart, end: outage.regEnd, isolation: outage.scope
    });
    res.json({ draft: { ...draft, outageId: outage.id } });
  }));

  // công việc không có lịch cắt điện: ngăn lộ theo địa điểm/thiết bị; không có bước cô lập
  router.get('/works/:id/plan-draft', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    const work = await loadVisibleWork(db, policy, actor, req.params.id);
    const draft = await planDraftFrom(actor, {
      content: work.content, location: work.stationName || work.location, bays: work.location, start: work.startTime, end: work.endTime
    }, work.substationId);
    res.json({ draft: { ...draft, workId: work.id }, numbering: await numberingInfo(actor) });
  }));

  router.get('/plan-numbering', wrap(async (req, res) => {
    res.json({ numbering: await numberingInfo(await policy.actorOf(req)) });
  }));

  router.put('/plan-numbering', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    if (!(await policy.canCreate(actor))) throw forbidden('Chỉ trưởng/phó tổ, trưởng phòng hoặc admin được đặt số khởi đầu.');
    const unit = await getUnit(actor.id);
    await numbering.setStartNumber(unit.department, vnYear(), req.body?.startNumber, actor.id);
    res.json({ numbering: await numberingInfo(actor) });
  }));

  router.get('/plans', wrap(async (req, res) => {
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
      where.push(`(docNumber ${LIKE} OR workTitle ${LIKE} OR stationName ${LIKE})`);
      params.push(...Array(3).fill(likePattern(search)));
    }
    const rows = await db.query(`SELECT ${LIST_COLUMNS} FROM dkct_plans ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY docYear DESC, docSeq DESC LIMIT 500`, params);
    const items = [];
    for (const row of rows) items.push(await present(row, actor));
    res.json({ items: await attachOutageChanges(db, items) }); // cảnh báo lịch cắt điện đã hoãn / dời / sửa
  }));

  router.get('/plans/:id', wrap(async (req, res) => {
    const { actor, row } = await loadVisible(req, `${LIST_COLUMNS}, data`);
    res.json({ plan: await present(row, actor) });
  }));

  // địa danh cho ô chọn của phương án (mặc định + địa danh người dùng đã thêm)
  router.get('/places', wrap(async (req, res) => {
    await policy.actorOf(req);
    res.json({ items: await places.list(), defaultPlace: DEFAULT_PLACE });
  }));

  router.post('/plans', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    if (!(await policy.canCreate(actor))) throw forbidden('Chỉ trưởng/phó tổ, trưởng phòng hoặc admin được lập phương án.');
    const data = await normalize(req.body, res);
    if (!data) return;
    data.preparedBy = (await getProfile(actor.id))?.fullName || '';
    await places.remember(data.header.place);
    const unit = await getUnit(actor.id);
    const year = vnYear();
    const seq = await numbering.takeNext(unit.department, year);
    const id = newId('PA');
    const docNumber = formatPlanNumber(seq, unit.shortName, data.header.numberSuffix);
    await db.execute(`
      INSERT INTO dkct_plans (id, docSeq, docYear, docDepartment, docNumber, department, workTitle, stationName, startTime,
        substationId, surveyId, outageId, workId, data, createdBy, updatedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, seq, year, unit.department, docNumber, actor.department || unit.department, ...summary(data, titleOf(data)),
      JSON.stringify(data), actor.id, actor.id]);
    const row = await db.queryOne(`SELECT ${LIST_COLUMNS}, data FROM dkct_plans WHERE id = ?`, [id]);
    res.status(201).json({ plan: await present(row, actor) });
  }));

  router.put('/plans/:id', wrap(async (req, res) => {
    const { actor, row } = await loadVisible(req, `${LIST_COLUMNS}, data`);
    if (!(await policy.canEdit(actor, row))) throw forbidden('Chỉ người lập, trưởng/phó tổ, trưởng phòng hoặc admin được sửa phương án.');
    const data = await normalize(req.body, res);
    if (!data) return;
    data.preparedBy = safeParse(row.data).preparedBy || '';  // người lập giữ nguyên khi hiệu chỉnh
    await places.remember(data.header.place);
    await db.execute(`
      UPDATE dkct_plans SET workTitle = ?, stationName = ?, startTime = ?, substationId = ?, surveyId = ?, outageId = ?, workId = ?,
        data = ?, updatedBy = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    [...summary(data, titleOf(data)), JSON.stringify(data), actor.id, row.id]);
    const updated = await db.queryOne(`SELECT ${LIST_COLUMNS}, data FROM dkct_plans WHERE id = ?`, [row.id]);
    res.json({ plan: await present(updated, actor) });
  }));

  router.delete('/plans/:id', wrap(async (req, res) => {
    const { actor, row } = await loadVisible(req, LIST_COLUMNS);
    if (!(await policy.canEdit(actor, row))) throw forbidden('Chỉ người lập, trưởng/phó tổ, trưởng phòng hoặc admin được xóa phương án.');
    await db.execute('DELETE FROM dkct_plans WHERE id = ?', [row.id]);
    res.json({ success: true });
  }));

  // Xem trước bản Word từ dữ liệu đang soạn (chưa lưu): không cấp số, không ghi gì
  router.post('/plans/preview', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    if (!(await policy.canCreate(actor))) throw forbidden('Chỉ trưởng/phó tổ, trưởng phòng hoặc admin được lập phương án.');
    const data = await normalize(req.body, res);
    if (!data) return;
    data.preparedBy = (await getProfile(actor.id))?.fullName || '';
    sendPreview(res, await templates.render('plan', async (tpl) => renderPlanDocx({ docNumber: previewNumber(null, req.query), data }, await drawingsFor(data), tpl)));
  }));

  router.post('/plans/:id/preview', wrap(async (req, res) => {
    const { actor, row } = await loadVisible(req, `${LIST_COLUMNS}, data`);
    if (!(await policy.canEdit(actor, row))) throw forbidden('Chỉ người lập, trưởng/phó tổ, trưởng phòng hoặc admin được sửa phương án.');
    const data = await normalize(req.body, res);
    if (!data) return;
    data.preparedBy = safeParse(row.data).preparedBy || '';
    sendPreview(res, await templates.render('plan', async (tpl) => renderPlanDocx({ docNumber: row.docNumber, data }, await drawingsFor(data), tpl)));
  }));

  router.get('/plans/:id/docx', wrap(async (req, res) => {
    const { row } = await loadVisible(req);
    const data = safeParse(row.data);
    const buffer = await templates.render('plan', async (tpl) => renderPlanDocx({ docNumber: row.docNumber, data }, await drawingsFor(data), tpl));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', attachment(docxFileName('plan', {
      date: data.header?.date, number: row.docNumber, bays: data.bays, bayText: data.equipmentText, station: data.station?.name
    })));
    res.send(buffer);
  }));

  return router;
}

module.exports = { planRouter, DEFAULT_LEGAL_BASES, DEFAULT_INSTRUMENTS };
