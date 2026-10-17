/**
 * Biên bản khảo sát hiện trường (BBKSHT): danh sách/xem/lập/sửa/xóa, ảnh sơ đồ một sợi, hình ảnh khảo sát hiện trường,
 * xuất DOCX theo mẫu.
 * Quyền giống giấy ĐKCT: trưởng/phó tổ, trưởng phòng, admin lập; người lập hoặc lãnh đạo tổ sửa; cùng tổ xem.
 */
const express = require('express');
const { attachOutageChanges } = require('../services/outageChange');
const { docxFileName, attachment } = require('../services/fileName');
const multer = require('multer');
const { newId, sameUnitName } = require('../schema');
const { forbidden } = require('../policy');
const { normalizeSurvey, surveyFromOutage } = require('../services/survey');
const { renderSurveyDocx, imageInfo } = require('../services/surveyRender');
const { vnNow } = require('../services/clock');
const { likePattern, LIKE, safeParse, sendPreview, previewNumber } = require('../util');
const { workAsOutage, loadVisibleWork, timeTextOf, DEFAULT_SCOPE } = require('../services/work');

const MAX_DIAGRAM_BYTES = 10 * 1024 * 1024;
const MAX_DIAGRAM_SIDE = 12000;
const MAX_PHOTOS = 30;
// ảnh khảo sát đã được trình duyệt thu nhỏ (≤ 1600 px, JPEG): giới hạn riêng để xuất Word không ngốn bộ nhớ máy chủ
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_PHOTOS_TOTAL_BYTES = 40 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DIAGRAM_BYTES, files: 1, fields: 5 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpeg)$/.test(file.mimetype))
});

const LIST_COLUMNS = 'id, department, surveyTime, stationName, substationId, workContent, outageId, workId, diagramType, createdBy, createdAt, updatedAt';

function surveyRouter({ db, policy, wrap, getProfile, getUnit, defaultUnitName, templates }) {
  const router = express.Router();

  const present = async (row, actor, canEdit = policy.canEdit) => ({
    id: row.id,
    department: row.department,
    surveyTime: row.surveyTime,
    stationName: row.stationName,
    substationId: row.substationId,
    workContent: row.workContent,
    outageId: row.outageId,
    workId: row.workId,
    hasDiagram: !!row.diagramType,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    data: row.data === undefined ? undefined : safeParse(row.data),
    canEdit: await canEdit(actor, row)
  });

  async function loadVisible(req, columns = '*') {
    const actor = await policy.actorOf(req);
    const row = await db.queryOne(`SELECT ${columns} FROM dkct_surveys WHERE id = ?`, [req.params.id]);
    if (!row) throw Object.assign(new Error('Không tìm thấy biên bản khảo sát.'), { status: 404 });
    if (!policy.canView(actor, row)) throw forbidden('Biên bản khảo sát này thuộc tổ khác.');
    return { actor, row };
  }

  async function loadEditable(req, columns) {
    const found = await loadVisible(req, columns);
    if (!(await policy.canEdit(found.actor, found.row))) throw forbidden('Chỉ người lập biên bản, trưởng/phó tổ, trưởng phòng hoặc admin được sửa.');
    return found;
  }

  const loadSubstations = () => db.query(`SELECT s.id, s.name, s.stationId, s.active, u.name AS unitName
    FROM dkct_substations s JOIN dkct_stations u ON u.id = s.stationId`);

  async function normalize(body, res) {
    const substations = await loadSubstations();
    const { data, errors } = normalizeSurvey(body || {}, { substations: new Map(substations.map(s => [s.id, s])) });
    if (errors.length) {
      res.status(422).json({ error: errors[0].message, errors, data });
      return null;
    }
    if (data.outageId && !(await db.queryOne('SELECT id FROM dkct_outages WHERE id = ?', [data.outageId]))) data.outageId = null;
    if (data.workId && !(await db.queryOne('SELECT id FROM dkct_works WHERE id = ?', [data.workId]))) data.workId = null;
    return data;
  }

  const summary = (data) => [data.surveyTime, data.station.name.slice(0, 255), data.station.substationId, data.workContent.slice(0, 2000), data.outageId, data.workId];

  /** Biên bản mới: tổ và người đại diện theo người đang đăng nhập, thời điểm là bây giờ. */
  async function buildSurveyDefaults(actor) {
    const [profile, unit, last] = await Promise.all([
      getProfile(actor.id),
      getUnit(actor.id).catch(() => null),
      db.queryOne('SELECT data FROM dkct_surveys WHERE department = ? ORDER BY createdAt DESC LIMIT 1', [actor.department || ''])
    ]);
    const lastHeader = (last && safeParse(last.data).header) || {};
    const teamShort = unit?.shortName || '';
    const position = profile?.position || '';
    return {
      header: { unitName: lastHeader.unitName || defaultUnitName, teamName: actor.department || '', teamShort },
      surveyTime: vnNow(),
      station: { substationId: null, name: '', qlvhUnitId: null, qlvhUnitName: '' },
      workUnitReps: [{
        honorific: 'Ông',
        name: profile?.fullName || '',
        role: position && teamShort ? `${position} - Tổ ${teamShort}` : position
      }],
      qlvhReps: [],
      relatedUnits: 'không',
      equipment: '',
      workContent: '',
      scopeItems: [''],
      timeText: 'theo lịch cắt điện được duyệt.',
      risks: [],
      diagramDate: null,
      outageId: null,
      workId: null
    };
  }

  router.get('/survey-defaults', wrap(async (req, res) => {
    res.json({ draft: await buildSurveyDefaults(await policy.actorOf(req)) });
  }));

  router.get('/outages/:id/survey-draft', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    const outage = await db.queryOne('SELECT * FROM dkct_outages WHERE id = ?', [req.params.id]);
    if (!outage) return res.status(404).json({ error: 'Không tìm thấy dòng lịch.' });
    // địa điểm của lịch trùng tên một TBA trong danh mục -> gắn TBA và đơn vị QLVH
    const substation = (await loadSubstations()).find(s => s.active && sameUnitName(s.name, outage.location)) || null;
    res.json({ draft: { ...(await buildSurveyDefaults(actor)), ...surveyFromOutage(outage, substation) } });
  }));

  // công việc không có lịch cắt điện: trạm (danh mục), địa điểm/thiết bị, nội dung, điều kiện lấy từ công việc
  router.get('/works/:id/survey-draft', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    const work = await loadVisibleWork(db, policy, actor, req.params.id);
    const subs = (await loadSubstations()).filter(s => s.active);
    const substation = subs.find(s => s.id === work.substationId) || subs.find(s => sameUnitName(s.name, work.stationName)) || null;
    const draft = await buildSurveyDefaults(actor);
    const from = surveyFromOutage(workAsOutage(work), substation);
    const lines = (v) => String(v || '').split('\n').map(x => x.trim()).filter(Boolean);
    // phạm vi công tác = địa điểm/thiết bị; điều kiện chỉ là biện pháp khi khác "Không cắt điện."
    res.json({
      draft: {
        ...draft,
        ...from,
        scopeItems: lines(work.location).length ? lines(work.location) : [''],
        risks: work.scope && work.scope !== DEFAULT_SCOPE ? from.risks : [],
        outageId: null,
        workId: work.id,
        equipment: work.location || '',
        timeText: timeTextOf(work)
      }
    });
  }));

  router.get('/surveys', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    const where = [];
    const params = [];
    if (!policy.isAdmin(actor)) {
      if (!actor.department) return res.json({ items: [] });
      where.push('department = ?');
      params.push(actor.department);
    }
    const year = Number.parseInt(req.query.year, 10);
    if (year) { where.push('surveyTime LIKE ?'); params.push(`${year}-%`); }
    const search = String(req.query.search || '').trim();
    if (search) {
      where.push(`(stationName ${LIKE} OR workContent ${LIKE})`);
      params.push(likePattern(search), likePattern(search));
    }
    const rows = await db.query(`SELECT ${LIST_COLUMNS} FROM dkct_surveys ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY surveyTime DESC, createdAt DESC LIMIT 500`, params);
    const items = [];
    const canEdit = policy.editChecker();
    for (const row of rows) items.push(await present(row, actor, canEdit));
    res.json({ items: await attachOutageChanges(db, items) }); // cảnh báo lịch cắt điện đã hoãn / dời / sửa
  }));

  router.get('/surveys/:id', wrap(async (req, res) => {
    const { actor, row } = await loadVisible(req, `${LIST_COLUMNS}, data`);
    res.json({ survey: await present(row, actor) });
  }));

  router.post('/surveys', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    if (!(await policy.canCreate(actor))) throw forbidden('Chỉ trưởng/phó tổ, trưởng phòng hoặc admin được lập biên bản khảo sát.');
    const data = await normalize(req.body, res);
    if (!data) return;
    const id = newId('KS');
    await db.execute(`
      INSERT INTO dkct_surveys (id, department, surveyTime, stationName, substationId, workContent, outageId, workId, data, createdBy, updatedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, actor.department || '', ...summary(data), JSON.stringify(data), actor.id, actor.id]);
    const row = await db.queryOne(`SELECT ${LIST_COLUMNS}, data FROM dkct_surveys WHERE id = ?`, [id]);
    res.status(201).json({ survey: await present(row, actor) });
  }));

  router.put('/surveys/:id', wrap(async (req, res) => {
    const { actor, row } = await loadEditable(req, LIST_COLUMNS);
    const data = await normalize(req.body, res);
    if (!data) return;
    await db.execute(`
      UPDATE dkct_surveys SET surveyTime = ?, stationName = ?, substationId = ?, workContent = ?, outageId = ?, workId = ?, data = ?,
        updatedBy = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    [...summary(data), JSON.stringify(data), actor.id, row.id]);
    const updated = await db.queryOne(`SELECT ${LIST_COLUMNS}, data FROM dkct_surveys WHERE id = ?`, [row.id]);
    res.json({ survey: await present(updated, actor) });
  }));

  router.delete('/surveys/:id', wrap(async (req, res) => {
    const { row } = await loadEditable(req, LIST_COLUMNS);
    await db.execute('DELETE FROM dkct_survey_photos WHERE surveyId = ?', [row.id]);
    await db.execute('DELETE FROM dkct_surveys WHERE id = ?', [row.id]);
    res.json({ success: true });
  }));

  // Ảnh sơ đồ: kiểm tra quyền TRƯỚC khi nhận file
  const requireEditor = wrap(async (req, res, next) => {
    req.dkctSurvey = (await loadEditable(req, LIST_COLUMNS)).row;
    next();
  });

  router.put('/surveys/:id/diagram', requireEditor, upload.single('file'), wrap(async (req, res) => {
    const info = req.file ? imageInfo(req.file.buffer) : null;
    if (!info) throw Object.assign(new Error('Chọn ảnh sơ đồ dạng PNG hoặc JPG (tối đa 10 MB).'), { status: 400 });
    if (!info.width || !info.height || info.width > MAX_DIAGRAM_SIDE || info.height > MAX_DIAGRAM_SIDE) {
      throw Object.assign(new Error(`Ảnh sơ đồ phải nhỏ hơn ${MAX_DIAGRAM_SIDE}×${MAX_DIAGRAM_SIDE} điểm ảnh.`), { status: 400 });
    }
    await db.execute('UPDATE dkct_surveys SET diagram = ?, diagramType = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [req.file.buffer.toString('base64'), info.type, req.dkctSurvey.id]);
    res.json({ success: true, width: info.width, height: info.height });
  }));

  router.delete('/surveys/:id/diagram', wrap(async (req, res) => {
    const { row } = await loadEditable(req, LIST_COLUMNS);
    await db.execute('UPDATE dkct_surveys SET diagram = NULL, diagramType = NULL, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
    res.json({ success: true });
  }));

  router.get('/surveys/:id/diagram', wrap(async (req, res) => {
    const { row } = await loadVisible(req, 'id, department, createdBy, diagram, diagramType');
    if (!row.diagram) return res.status(404).json({ error: 'Biên bản chưa có ảnh sơ đồ.' });
    res.setHeader('Content-Type', `image/${row.diagramType}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(Buffer.from(row.diagram, 'base64'));
  }));

  // Hình ảnh khảo sát hiện trường (nếu có): nhiều ảnh, mỗi ảnh một chú thích, theo thứ tự; in ở trang phụ lục cuối biên bản
  const photoMeta = (r) => ({ id: r.id, caption: r.caption || '', width: r.width, height: r.height, size: r.size, sortOrder: Number(r.sortOrder) || 0 });
  async function loadPhotos(surveyId) {
    const rows = await db.query('SELECT caption, image FROM dkct_survey_photos WHERE surveyId = ? ORDER BY sortOrder, createdAt, id', [surveyId]);
    return rows.map(r => ({ caption: r.caption || '', buffer: Buffer.isBuffer(r.image) ? r.image : Buffer.from(r.image) }));
  }
  const cleanCaption = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300);

  router.get('/surveys/:id/photos', wrap(async (req, res) => {
    const { row } = await loadVisible(req, 'id, department, createdBy');
    const rows = await db.query(`SELECT id, caption, width, height, size, sortOrder FROM dkct_survey_photos
      WHERE surveyId = ? ORDER BY sortOrder, createdAt, id`, [row.id]);
    res.json({ items: rows.map(photoMeta) });
  }));

  router.get('/surveys/:id/photos/:photoId', wrap(async (req, res) => {
    const { row } = await loadVisible(req, 'id, department, createdBy');
    const photo = await db.queryOne('SELECT image, imageType FROM dkct_survey_photos WHERE id = ? AND surveyId = ?', [req.params.photoId, row.id]);
    if (!photo) return res.status(404).json({ error: 'Không tìm thấy ảnh.' });
    res.setHeader('Content-Type', `image/${photo.imageType}`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.isBuffer(photo.image) ? photo.image : Buffer.from(photo.image));
  }));

  router.post('/surveys/:id/photos', requireEditor, upload.single('file'), wrap(async (req, res) => {
    const info = req.file ? imageInfo(req.file.buffer) : null;
    if (!info) throw Object.assign(new Error('Chọn ảnh dạng PNG hoặc JPG (tối đa 10 MB).'), { status: 400 });
    if (!info.width || !info.height || info.width > MAX_DIAGRAM_SIDE || info.height > MAX_DIAGRAM_SIDE) {
      throw Object.assign(new Error(`Ảnh phải nhỏ hơn ${MAX_DIAGRAM_SIDE}×${MAX_DIAGRAM_SIDE} điểm ảnh.`), { status: 400 });
    }
    if (req.file.size > MAX_PHOTO_BYTES) throw Object.assign(new Error('Ảnh khảo sát tối đa 4 MB — chọn ảnh nhỏ hơn.'), { status: 400 });
    const surveyId = req.dkctSurvey.id;
    const stat = await db.queryOne('SELECT COUNT(*) AS n, MAX(sortOrder) AS last, SUM(size) AS total FROM dkct_survey_photos WHERE surveyId = ?', [surveyId]);
    if (Number(stat?.n) >= MAX_PHOTOS) throw Object.assign(new Error(`Mỗi biên bản tối đa ${MAX_PHOTOS} ảnh.`), { status: 400 });
    if ((Number(stat?.total) || 0) + req.file.size > MAX_PHOTOS_TOTAL_BYTES) {
      throw Object.assign(new Error('Tổng dung lượng ảnh của biên bản đã tới giới hạn 40 MB.'), { status: 400 });
    }
    const photo = {
      id: newId('ANH'), caption: cleanCaption(req.body?.caption), width: info.width, height: info.height, size: req.file.size,
      sortOrder: stat?.last === null || stat?.last === undefined ? 0 : Number(stat.last) + 1
    };
    const actor = await policy.actorOf(req);
    await db.execute(`INSERT INTO dkct_survey_photos (id, surveyId, sortOrder, caption, image, imageType, width, height, size, createdBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [photo.id, surveyId, photo.sortOrder, photo.caption, req.file.buffer, info.type, info.width, info.height, req.file.size, actor.id]);
    await db.execute('UPDATE dkct_surveys SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [surveyId]);
    res.json({ photo: photoMeta(photo) });
  }));

  // sửa chú thích và thứ tự: items [{ id, caption }] theo thứ tự mới (ảnh không có trong danh sách giữ nguyên)
  router.put('/surveys/:id/photos', wrap(async (req, res) => {
    const { row } = await loadEditable(req, LIST_COLUMNS);
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, MAX_PHOTOS) : [];
    for (const [i, item] of items.entries()) {
      await db.execute('UPDATE dkct_survey_photos SET caption = ?, sortOrder = ? WHERE id = ? AND surveyId = ?',
        [cleanCaption(item?.caption), i, String(item?.id || ''), row.id]);
    }
    const rows = await db.query(`SELECT id, caption, width, height, size, sortOrder FROM dkct_survey_photos
      WHERE surveyId = ? ORDER BY sortOrder, createdAt, id`, [row.id]);
    res.json({ items: rows.map(photoMeta) });
  }));

  router.delete('/surveys/:id/photos/:photoId', wrap(async (req, res) => {
    const { row } = await loadEditable(req, LIST_COLUMNS);
    await db.execute('DELETE FROM dkct_survey_photos WHERE id = ? AND surveyId = ?', [req.params.photoId, row.id]);
    res.json({ success: true });
  }));

  // Xem trước bản Word từ dữ liệu đang soạn (chưa lưu). Ảnh sơ đồ: ảnh đã lưu (?noDiagram=1 khi đang gỡ ảnh);
  // ảnh mới chọn chỉ có sau khi lưu. Hình ảnh khảo sát: các ảnh đã lưu.
  router.post('/surveys/preview', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    if (!(await policy.canCreate(actor))) throw forbidden('Chỉ trưởng/phó tổ, trưởng phòng hoặc admin được lập biên bản khảo sát.');
    const data = await normalize(req.body, res);
    if (!data) return;
    sendPreview(res, await templates.render('survey', (tpl) => renderSurveyDocx({ data }, null, tpl)));
  }));

  router.post('/surveys/:id/preview', wrap(async (req, res) => {
    const { row } = await loadEditable(req, `${LIST_COLUMNS}, diagram`);
    const data = await normalize(req.body, res);
    if (!data) return;
    const diagram = row.diagram && req.query.noDiagram !== '1' ? { buffer: Buffer.from(row.diagram, 'base64') } : null;
    const photos = await loadPhotos(row.id);
    sendPreview(res, await templates.render('survey', (tpl) => renderSurveyDocx({ data }, diagram, tpl, photos)));
  }));

  router.get('/surveys/:id/docx', wrap(async (req, res) => {
    const { row } = await loadVisible(req);
    const data = safeParse(row.data);
    const photos = await loadPhotos(row.id);
    const buffer = await templates.render('survey', (tpl) => renderSurveyDocx({ data }, row.diagram ? { buffer: Buffer.from(row.diagram, 'base64') } : null, tpl, photos));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', attachment(docxFileName('survey', {
      date: data.surveyTime, bayText: [data.equipment, ...(data.scopeItems || []), data.workContent].join(' '), station: data.station?.name
    })));
    res.send(buffer);
  }));

  return router;
}

module.exports = { surveyRouter };
