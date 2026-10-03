/**
 * Mẫu Word của văn bản xuất ra: xem danh sách, tải về, kiểm tra, tải lên mẫu mới, sửa tên/ghi chú, thay file,
 * chọn mẫu đang dùng (hoặc mẫu gốc), xóa. Mọi người xem/tải về; chỉ admin thay đổi.
 */
const express = require('express');
const multer = require('multer');
const { newId } = require('../schema');
const { forbidden } = require('../policy');
const { changedRows, sendPreview } = require('../util');
const { attachment } = require('../services/fileName');
const { KINDS, MAX_BYTES, builtinBuffer, builtinTags } = require('../services/templateStore');

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1, fields: 6 } });
const text = (v, n) => String(v ?? '').trim().slice(0, n);
const asFlag = (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';

function docTemplateRouter({ db, policy, wrap, templates }) {
  const router = express.Router();

  // quyền admin kiểm tra TRƯỚC khi nhận file
  const requireAdmin = wrap(async (req, res, next) => {
    const actor = await policy.actorOf(req);
    if (!policy.isAdmin(actor)) throw forbidden('Chỉ admin được thay đổi mẫu văn bản.');
    req.dkctActor = actor;
    next();
  });
  const kindOf = (req) => {
    if (!KINDS[req.params.kind]) throw Object.assign(new Error('Loại văn bản không hợp lệ.'), { status: 400 });
    return req.params.kind;
  };
  const fileOf = (req) => {
    if (!req.file) throw Object.assign(new Error('Chọn file mẫu Word (.docx).'), { status: 400 });
    if (!/\.docx$/i.test(req.file.originalname)) throw Object.assign(new Error('Chỉ nhận file Word .docx (không nhận .doc).'), { status: 400 });
    return req.file;
  };
  const loadItem = async (id) => {
    const row = await db.queryOne('SELECT id, kind, name, active FROM dkct_doc_templates WHERE id = ?', [id]);
    if (!row) throw Object.assign(new Error('Không tìm thấy mẫu.'), { status: 404 });
    return row;
  };
  const setActive = async (kind, id) => {
    await db.execute('UPDATE dkct_doc_templates SET active = 0 WHERE kind = ?', [kind]);
    if (id) await db.execute('UPDATE dkct_doc_templates SET active = 1, revision = revision + 1 WHERE id = ? AND kind = ?', [id, kind]);
    templates.invalidate(kind);
  };

  router.get('/doc-templates', wrap(async (req, res) => {
    await policy.actorOf(req);
    const rows = await db.query(`SELECT id, kind, name, note, fileName, size, active, createdBy, createdAt, updatedAt
      FROM dkct_doc_templates ORDER BY active DESC, createdAt DESC`); // mẫu đang dùng lên đầu
    res.json({
      kinds: Object.entries(KINDS).map(([kind, k]) => ({
        kind, label: k.label,
        builtin: { fileName: k.file, size: builtinBuffer(kind).length, tags: builtinTags(kind) },
        items: rows.filter(r => r.kind === kind).map(r => ({ ...r, active: Number(r.active) === 1 }))
      }))
    });
  }));

  // tải mẫu gốc (để sửa trong Word làm mẫu mới)
  router.get('/doc-templates/:kind/builtin', wrap(async (req, res) => {
    await policy.actorOf(req);
    const kind = kindOf(req);
    res.setHeader('Content-Type', DOCX_TYPE);
    res.setHeader('Content-Disposition', attachment(`Mau goc - ${KINDS[kind].file}`));
    res.send(builtinBuffer(kind));
  }));

  router.get('/doc-templates/item/:id/file', wrap(async (req, res) => {
    await policy.actorOf(req);
    const row = await db.queryOne('SELECT fileName, content FROM dkct_doc_templates WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Không tìm thấy mẫu.' });
    res.setHeader('Content-Type', DOCX_TYPE);
    res.setHeader('Content-Disposition', attachment(row.fileName || 'mau.docx'));
    res.send(Buffer.from(row.content));
  }));

  // kiểm tra file mẫu (không lưu): báo lỗi cú pháp, thẻ lạ / thẻ thiếu, thử điền văn bản gần nhất
  router.post('/doc-templates/:kind/check', requireAdmin, upload.single('file'), wrap(async (req, res) => {
    const kind = kindOf(req);
    res.json({ report: await templates.check(kind, fileOf(req).buffer) });
  }));

  // xem thử: điền văn bản gần nhất (hoặc dữ liệu trống) vào file mẫu -> .docx để xem trước
  router.post('/doc-templates/:kind/preview', requireAdmin, upload.single('file'), wrap(async (req, res) => {
    const kind = kindOf(req);
    const buffer = req.file ? fileOf(req).buffer : null;
    sendPreview(res, await templates.renderSample(kind, buffer));
  }));
  router.get('/doc-templates/item/:id/preview', requireAdmin, wrap(async (req, res) => {
    const row = await db.queryOne('SELECT kind, content FROM dkct_doc_templates WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Không tìm thấy mẫu.' });
    sendPreview(res, await templates.renderSample(row.kind, Buffer.from(row.content)));
  }));

  router.post('/doc-templates/:kind', requireAdmin, upload.single('file'), wrap(async (req, res) => {
    const kind = kindOf(req);
    const file = fileOf(req);
    const report = await templates.check(kind, file.buffer);
    const id = newId('MAU');
    const name = text(req.body?.name, 255) || file.originalname.replace(/\.docx$/i, '');
    await db.execute(`INSERT INTO dkct_doc_templates (id, kind, name, note, fileName, content, size, active, createdBy, updatedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, kind, name, text(req.body?.note, 2000) || null, text(file.originalname, 255), file.buffer, file.size, req.dkctActor.id, req.dkctActor.id]);
    if (asFlag(req.body?.activate)) await setActive(kind, id);
    res.status(201).json({ id, report, active: asFlag(req.body?.activate) });
  }));

  // sửa tên / ghi chú
  router.put('/doc-templates/item/:id', requireAdmin, wrap(async (req, res) => {
    await loadItem(req.params.id);
    const name = text(req.body?.name, 255);
    if (!name) throw Object.assign(new Error('Nhập tên mẫu.'), { status: 400 });
    await db.execute('UPDATE dkct_doc_templates SET name = ?, note = ?, updatedBy = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [name, text(req.body?.note, 2000) || null, req.dkctActor.id, req.params.id]);
    res.json({ success: true });
  }));

  // thay file của mẫu (vd sửa lỗi chính tả trong Word rồi tải lại); mẫu đang dùng thì có hiệu lực ngay
  router.post('/doc-templates/item/:id/file', requireAdmin, upload.single('file'), wrap(async (req, res) => {
    const item = await loadItem(req.params.id);
    const file = fileOf(req);
    const report = await templates.check(item.kind, file.buffer);
    await db.execute(`UPDATE dkct_doc_templates SET content = ?, fileName = ?, size = ?, revision = revision + 1, updatedBy = ?,
      updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [file.buffer, text(file.originalname, 255), file.size, req.dkctActor.id, item.id]);
    templates.invalidate(item.kind);
    res.json({ report });
  }));

  // chọn mẫu đang dùng: { id } của mẫu đã tải lên, hoặc { id: null } = mẫu gốc
  router.put('/doc-templates/:kind/active', requireAdmin, wrap(async (req, res) => {
    const kind = kindOf(req);
    const id = req.body?.id || null;
    if (id) {
      const item = await loadItem(id);
      if (item.kind !== kind) throw Object.assign(new Error('Mẫu không thuộc loại văn bản này.'), { status: 400 });
    }
    await setActive(kind, id);
    res.json({ kind, active: id });
  }));

  router.delete('/doc-templates/item/:id', requireAdmin, wrap(async (req, res) => {
    const item = await loadItem(req.params.id);
    if (!changedRows(await db.execute('DELETE FROM dkct_doc_templates WHERE id = ?', [item.id]))) {
      return res.status(404).json({ error: 'Không tìm thấy mẫu.' });
    }
    templates.invalidate(item.kind);
    res.json({ success: true, wasActive: Number(item.active) === 1 }); // mẫu đang dùng bị xóa -> quay về mẫu gốc
  }));

  return router;
}

module.exports = { docTemplateRouter };
