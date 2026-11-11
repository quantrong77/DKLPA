/**
 * Bản vẽ sơ đồ trạm biến áp: PDF gốc + ảnh của một trang (trình duyệt dựng bằng pdf.js lúc tải lên).
 * Một trạm có thể có nhiều sơ đồ, đặt tên để phân biệt (vd TBA 500kV: "Phía 500kV", "Phía 220kV").
 * Biên bản khảo sát dùng một ảnh làm sơ đồ một sợi; phương án chọn một hoặc nhiều sơ đồ cho Phụ lục IV.
 * Ai đăng nhập cũng xem được; người sửa được danh mục mới tải/sửa/xóa.
 */
const express = require('express');
const multer = require('multer');
const { forbidden } = require('../policy');
const { imageInfo } = require('../services/surveyRender');
const { newId, drawingSortOrder } = require('../schema');

const MAX_PDF = 20 * 1024 * 1024;
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_SIDE = 12000;
const MAX_LABEL = 100;
const MAX_PER_SUBSTATION = 10;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PDF, files: 2, fields: 6 } });
const uploadFiles = upload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'image', maxCount: 1 }]);

const META = 'id, substationId, label, sortOrder, fileName, pdfSize, page, pageCount, imageType, width, height, uploadedBy, createdAt, updatedAt';
const ORDER = 'ORDER BY sortOrder, label';
const toBuffer = (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v));
const fail = (status, message) => Object.assign(new Error(message), { status });
const bad = (message) => fail(400, message);
const intIn = (v, min, max, fallback) => Math.max(min, Math.min(max, Number.parseInt(v, 10) || fallback));
const labelKey = (s) => String(s || '').normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, '');

function cleanLabel(value) {
  const label = String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!label) throw bad('Đặt tên sơ đồ (vd "Phía 500kV", "Phía 220kV" hoặc "Sơ đồ trạm").');
  if (label.length > MAX_LABEL) throw bad(`Tên sơ đồ tối đa ${MAX_LABEL} ký tự.`);
  return label;
}

/** Kiểm tra PDF + ảnh trang gửi lên; trả về các cột file. */
function readFiles(req) {
  const pdf = req.files?.pdf?.[0];
  const image = req.files?.image?.[0];
  if (!pdf || pdf.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw bad('Chọn file bản vẽ dạng PDF (tối đa 20 MB).');
  const info = image && image.size <= MAX_IMAGE ? imageInfo(image.buffer) : null;
  if (!info) throw bad('Thiếu ảnh trang bản vẽ (PNG/JPG, tối đa 10 MB). Tải lại trang rồi thử lại.');
  if (!info.width || !info.height || info.width > MAX_SIDE || info.height > MAX_SIDE) throw bad(`Ảnh trang bản vẽ phải nhỏ hơn ${MAX_SIDE}×${MAX_SIDE} điểm ảnh.`);
  const pageCount = intIn(req.body?.pageCount, 1, 10000, 1);
  return {
    fileName: String(pdf.originalname || 'ban-ve.pdf').slice(0, 255), pdf: pdf.buffer, pdfSize: pdf.size,
    page: intIn(req.body?.page, 1, pageCount, 1), pageCount, image: image.buffer, imageType: info.type, width: info.width, height: info.height
  };
}

function drawingRouter({ db, policy, wrap }) {
  const router = express.Router();

  const loadDrawing = async (id, columns = META) => {
    const row = await db.queryOne(`SELECT ${columns} FROM dkct_drawings WHERE id = ?`, [id]);
    if (!row) throw fail(404, 'Không tìm thấy bản vẽ.');
    return row;
  };
  const assertLabelFree = async (substationId, label, exceptId = null) => {
    const rows = await db.query('SELECT id, label FROM dkct_drawings WHERE substationId = ?', [substationId]);
    if (rows.some(r => r.id !== exceptId && labelKey(r.label) === labelKey(label))) throw fail(409, `Trạm đã có sơ đồ "${label}".`);
    return rows.length;
  };

  // kiểm tra quyền TRƯỚC khi nhận file (tới 20 MB)
  const requireManager = wrap(async (req, res, next) => {
    const actor = await policy.actorOf(req);
    if (!(await policy.canManageCatalog(actor))) throw forbidden('Chỉ trưởng/phó đơn vị, trưởng phòng hoặc admin được tải bản vẽ trạm.');
    if (req.params.substationId) {
      const sub = await db.queryOne('SELECT id FROM dkct_substations WHERE id = ?', [req.params.substationId]);
      if (!sub) throw fail(404, 'Không tìm thấy trạm biến áp.');
    } else {
      req.dkctDrawing = await loadDrawing(req.params.id, 'id, substationId, label');
    }
    req.dkctActor = actor;
    next();
  });

  router.get('/substation-drawings', wrap(async (req, res) => {
    await policy.actorOf(req);
    res.json({ items: await db.query(`SELECT ${META} FROM dkct_drawings ORDER BY substationId, sortOrder, label`) });
  }));

  router.get('/substations/:substationId/drawings', wrap(async (req, res) => {
    await policy.actorOf(req);
    res.json({ items: await db.query(`SELECT ${META} FROM dkct_drawings WHERE substationId = ? ${ORDER}`, [req.params.substationId]) });
  }));

  // thêm một sơ đồ cho trạm: multipart pdf + image + page + pageCount + label
  router.post('/substations/:substationId/drawings', requireManager, uploadFiles, wrap(async (req, res) => {
    const substationId = req.params.substationId;
    const label = cleanLabel(req.body?.label);
    const count = await assertLabelFree(substationId, label);
    if (count >= MAX_PER_SUBSTATION) throw bad(`Mỗi trạm tối đa ${MAX_PER_SUBSTATION} sơ đồ.`);
    const f = readFiles(req);
    const id = newId('BV');
    await db.execute(`INSERT INTO dkct_drawings
      (id, substationId, label, sortOrder, fileName, pdf, pdfSize, page, pageCount, image, imageType, width, height, uploadedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, substationId, label, drawingSortOrder(label), f.fileName, f.pdf, f.pdfSize, f.page, f.pageCount,
      f.image, f.imageType, f.width, f.height, req.dkctActor.id]);
    res.status(201).json({ drawing: await loadDrawing(id) });
  }));

  // đổi tên và/hoặc thay file (gửi kèm pdf + image thì thay file; chỉ gửi label thì chỉ đổi tên)
  router.put('/drawings/:id', requireManager, uploadFiles, wrap(async (req, res) => {
    const current = req.dkctDrawing;
    const label = cleanLabel(req.body?.label ?? current.label);
    await assertLabelFree(current.substationId, label, current.id);
    await db.execute('UPDATE dkct_drawings SET label = ?, sortOrder = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [label, drawingSortOrder(label), current.id]);
    if (req.files?.pdf || req.files?.image) {
      const f = readFiles(req);
      await db.execute(`UPDATE dkct_drawings SET fileName = ?, pdf = ?, pdfSize = ?, page = ?, pageCount = ?, image = ?, imageType = ?,
        width = ?, height = ?, uploadedBy = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [f.fileName, f.pdf, f.pdfSize, f.page, f.pageCount, f.image, f.imageType, f.width, f.height, req.dkctActor.id, current.id]);
    }
    res.json({ drawing: await loadDrawing(current.id) });
  }));

  router.delete('/drawings/:id', requireManager, wrap(async (req, res) => {
    await db.execute('DELETE FROM dkct_drawings WHERE id = ?', [req.dkctDrawing.id]);
    res.json({ success: true });
  }));

  router.get('/drawings/:id/image', wrap(async (req, res) => {
    await policy.actorOf(req);
    const row = await loadDrawing(req.params.id, 'image, imageType');
    res.setHeader('Content-Type', `image/${row.imageType}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(toBuffer(row.image));
  }));

  router.get('/drawings/:id/pdf', wrap(async (req, res) => {
    await policy.actorOf(req);
    const row = await loadDrawing(req.params.id, 'pdf, fileName');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="ban-ve.pdf"; filename*=UTF-8''${encodeURIComponent(row.fileName || 'ban-ve.pdf')}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(toBuffer(row.pdf));
  }));

  return router;
}

module.exports = { drawingRouter };
