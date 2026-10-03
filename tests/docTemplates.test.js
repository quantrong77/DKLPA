const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PizZip = require('pizzip');
const { startApp } = require('./helpers/app');
const { CONFIRMATION } = require('./fixtures/sampleConfirmation');
const { inspectTemplate, readTags } = require('../server/services/templateStore');

const GXN = fs.readFileSync(path.join(__dirname, '..', 'templates', 'template_gxn.docx'));

/** Sửa document.xml của mẫu gốc (thay chuỗi) -> Buffer .docx mới. */
function variant(buffer, edit) {
  const zip = new PizZip(buffer);
  zip.file('word/document.xml', edit(zip.file('word/document.xml').asText()));
  return zip.generate({ type: 'nodebuffer' });
}
const textOf = (buf) => new PizZip(buf).file('word/document.xml').asText().replace(/<[^>]+>/g, '');
const form = (buffer, fields = {}, name = 'mau-moi.docx') => {
  const f = new FormData();
  f.append('file', new Blob([buffer]), name);
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};
// tiêu đề mẫu gốc -> tiêu đề có dấu nhận biết mẫu mới (một run chữ trong document.xml)
const TITLE = 'GIẤY XÁC NHẬN';
const marked = (mark, extra = '') => variant(GXN, x => {
  assert.ok(x.includes(TITLE), 'mẫu gốc có tiêu đề');
  return x.replace(TITLE, `${TITLE} ${mark}${extra}`);
});

test('inspectTemplate: thẻ lạ / thẻ thiếu / nhãn ký số; lỗi cú pháp và file không phải .docx bị từ chối', () => {
  const base = inspectTemplate('confirmation', GXN);
  assert.deepEqual([base.unknown, base.missing], [[], []], 'mẫu gốc khớp chính nó');
  assert.ok(base.tags.includes('signer') && base.tags.includes('#items'));

  const extra = inspectTemplate('confirmation', variant(GXN, x => x.replace(TITLE, `${TITLE} {soHopDong}`).replace('{signer}', '')));
  assert.deepEqual(extra.unknown, ['soHopDong']);
  assert.deepEqual(extra.missing, ['signer']);

  assert.throws(() => inspectTemplate('confirmation', Buffer.from('không phải zip')), e => e.status === 422);
  assert.throws(() => inspectTemplate('confirmation', variant(GXN, x => x.replace('{/items}', ''))),
    e => e.status === 422 && e.errors.length > 0, 'vòng lặp không đóng');
  assert.throws(() => inspectTemplate('khac', GXN), e => e.status === 400);
  assert.deepEqual(readTags(new PizZip(variant(GXN, x => x.replace(TITLE, `${TITLE} ((nguoiky))`)))).signs, ['((nguoiky))']);
});

test('mẫu văn bản: admin tải lên, kiểm tra, chọn dùng, thay file, quay về mẫu gốc, xóa; văn bản xuất theo mẫu đang dùng', async () => {
  const app = await startApp();
  try {
    const created = (await app.call('lead', 'POST', '/confirmations', CONFIRMATION)).body.confirmation;
    const exportText = async () => textOf((await app.call('lead', 'GET', `/confirmations/${created.id}/docx`)).body);
    assert.doesNotMatch(await exportText(), /MẪU MỚI/);

    const list = (await app.call('member', 'GET', '/doc-templates')).body.kinds;
    assert.deepEqual(list.map(k => k.kind), ['survey', 'plan', 'registration', 'confirmation']);
    assert.ok(list.find(k => k.kind === 'plan').builtin.tags.signs.includes('((nguoilap))'), 'liệt kê nhãn ký số của mẫu gốc');
    const builtin = await app.call('member', 'GET', '/doc-templates/confirmation/builtin');
    assert.equal(builtin.status, 200);
    assert.equal(builtin.body.length, GXN.length);

    // chỉ admin; file sai bị từ chối kèm lý do
    assert.equal((await app.call('lead', 'POST', '/doc-templates/confirmation', form(marked('MẪU MỚI')))).status, 403);
    const bad = await app.call('admin', 'POST', '/doc-templates/confirmation', form(variant(GXN, x => x.replace('{/items}', ''))));
    assert.equal(bad.status, 422);
    assert.ok(bad.body.errors.length > 0);
    assert.equal((await app.call('admin', 'POST', '/doc-templates/confirmation', form(GXN, {}, 'mau.doc'))).status, 400, 'không nhận .doc');

    // kiểm tra trước khi lưu: báo thẻ lạ, thử điền bằng giấy gần nhất
    const check = (await app.call('admin', 'POST', '/doc-templates/confirmation/check', form(marked('MẪU MỚI', ' {soHopDong}')))).body.report;
    assert.deepEqual(check.unknown, ['soHopDong']);
    assert.match(check.sampleFrom, /Giấy xác nhận 1\/GXN/);
    const pv = await app.call('admin', 'POST', '/doc-templates/confirmation/preview', form(marked('MẪU MỚI')));
    assert.equal(pv.status, 200);
    assert.match(textOf(pv.body), /MẪU MỚI/);

    // lưu chưa dùng: văn bản vẫn theo mẫu gốc; chọn dùng: theo mẫu mới
    const up = await app.call('admin', 'POST', '/doc-templates/confirmation', form(marked('MẪU MỚI'), { name: 'Mẫu 2027', note: 'đổi tiêu đề' }));
    assert.equal(up.status, 201);
    assert.doesNotMatch(await exportText(), /MẪU MỚI/);
    assert.equal((await app.call('admin', 'PUT', '/doc-templates/confirmation/active', { id: up.body.id })).status, 200);
    assert.match(await exportText(), /MẪU MỚI/);
    assert.match(await exportText(), /Thí nghiệm định kỳ máy cắt MC 212/, 'vẫn điền dữ liệu');

    // sửa tên, thay file: có hiệu lực ngay (không giữ bản cũ trong bộ nhớ)
    assert.equal((await app.call('admin', 'PUT', `/doc-templates/item/${up.body.id}`, { name: 'Mẫu 2027 (sửa)', note: '' })).status, 200);
    assert.equal((await app.call('admin', 'PUT', `/doc-templates/item/${up.body.id}`, { name: ' ' })).status, 400);
    assert.equal((await app.call('admin', 'POST', `/doc-templates/item/${up.body.id}/file`, form(marked('BẢN SỬA')))).status, 200);
    assert.match(await exportText(), /BẢN SỬA/);
    const item = (await app.call('admin', 'GET', '/doc-templates')).body.kinds.find(k => k.kind === 'confirmation').items[0];
    assert.deepEqual([item.name, item.active, item.note], ['Mẫu 2027 (sửa)', true, null]);
    assert.match(textOf((await app.call('member', 'GET', `/doc-templates/item/${up.body.id}/file`)).body), /BẢN SỬA/);

    // tải lên luôn dùng ngay: thay mẫu đang dùng
    const up2 = await app.call('admin', 'POST', '/doc-templates/confirmation', form(marked('THỨ BA'), { activate: '1' }));
    assert.match(await exportText(), /THỨ BA/);
    const items = (await app.call('admin', 'GET', '/doc-templates')).body.kinds.find(k => k.kind === 'confirmation').items;
    assert.deepEqual(items.map(i => [i.id, i.active]), [[up2.body.id, true], [up.body.id, false]], 'mỗi loại một mẫu đang dùng, mẫu đang dùng lên đầu');

    // quay về mẫu gốc; xóa mẫu đang dùng cũng quay về mẫu gốc
    await app.call('admin', 'PUT', '/doc-templates/confirmation/active', { id: null });
    assert.doesNotMatch(await exportText(), /THỨ BA|BẢN SỬA/);
    await app.call('admin', 'PUT', '/doc-templates/confirmation/active', { id: up2.body.id });
    assert.equal((await app.call('admin', 'PUT', '/doc-templates/plan/active', { id: up2.body.id })).status, 400, 'mẫu khác loại');
    const del = (await app.call('admin', 'DELETE', `/doc-templates/item/${up2.body.id}`)).body;
    assert.equal(del.wasActive, true);
    assert.doesNotMatch(await exportText(), /THỨ BA/);
    assert.equal((await app.call('lead', 'DELETE', `/doc-templates/item/${up.body.id}`)).status, 403);
  } finally { app.close(); }
});

test('mẫu đang dùng lỗi khi điền -> báo rõ tên mẫu và cách quay về mẫu gốc (409)', async () => {
  const app = await startApp();
  try {
    const created = (await app.call('lead', 'POST', '/confirmations', CONFIRMATION)).body.confirmation;
    const up = await app.call('admin', 'POST', '/doc-templates/confirmation', form(marked('MẪU MỚI'), { name: 'Mẫu hỏng', activate: '1' }));
    // làm hỏng nội dung đã lưu (giả lập mẫu cũ không còn hợp lệ)
    await app.db.execute('UPDATE dkct_doc_templates SET content = ?, revision = revision + 1 WHERE id = ?', [Buffer.from('hỏng'), up.body.id]);
    const res = await app.call('lead', 'GET', `/confirmations/${created.id}/docx`);
    assert.equal(res.status, 409);
    assert.match(res.body.error, /Mẫu Word "Mẫu hỏng".*Mẫu văn bản/);
  } finally { app.close(); }
});
