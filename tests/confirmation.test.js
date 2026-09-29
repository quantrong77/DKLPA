const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const { normalizeConfirmation, confirmationFromRegistration, devicesIn, expand } = require('../server/services/confirmation');
const { renderConfirmationDocx, shortDate, placeDate } = require('../server/services/confirmationRender');
const { formatConfirmationNumber } = require('../server/services/numbering');

const plain = (xml) => xml.replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '');
const paragraphs = (xml) => xml.split('</w:p>').map(plain).map(s => s.trim());

const { CONFIRMATION } = require('./fixtures/sampleConfirmation');
const ctx = { substations: new Map([['TBA-1', { id: 'TBA-1', name: 'TBA 220kV Hàm Tân' }]]) };

test('formatConfirmationNumber: "5/GXN-TNKH"', () => {
  assert.equal(formatConfirmationNumber(5, 'TNKH'), '5/GXN-TNKH');
  assert.equal(formatConfirmationNumber(1, ''), '1/GXN');
});

test('normalizeConfirmation: bỏ mục trống, kết quả mặc định "đạt"; bắt buộc trạm, ngăn lộ, mục, ngày, người ký', () => {
  const { data, errors } = normalizeConfirmation(CONFIRMATION, ctx);
  assert.deepEqual(errors, []);
  assert.deepEqual(data.items.map(i => i.result), ['đạt', 'đạt']);
  const bad = normalizeConfirmation({ items: [{ text: '' }] }, ctx).errors.map(e => e.field);
  for (const f of ['station', 'bays', 'workObject', 'equipment', 'items', 'workDate', 'signer']) assert.ok(bad.includes(f), f);
  const picked = normalizeConfirmation({ ...CONFIRMATION, station: { substationId: 'TBA-1', name: 'tên cũ' } }, ctx).data.station;
  assert.deepEqual(picked, { substationId: 'TBA-1', name: 'TBA 220kV Hàm Tân' });
  assert.equal(normalizeConfirmation({ ...CONFIRMATION, items: Array(51).fill({ text: 'x' }) }, ctx).errors[0].field, 'items');
});

test('devicesIn / expand: lấy thiết bị, ngăn lộ trong nội dung công tác; mở chữ viết tắt', () => {
  assert.deepEqual(devicesIn('TNĐK ngăn MBA AT1'), ['MBA AT1']);
  assert.deepEqual(devicesIn('1.1/ Thay thế MC 174 & DCL 174-1, TU275, MC174'), ['MC 174', 'DCL 174-1', 'TU275']);
  assert.deepEqual(devicesIn('Thí nghiệm định kỳ năm 2026'), []);
  assert.equal(expand('TNĐK ngăn MC 200'), 'Thí nghiệm định kỳ ngăn MC 200');
  assert.equal(expand('TNĐ Lâm Đồng'), 'TNĐ Lâm Đồng', 'không mở "TN" trong từ khác');
});

test('confirmationFromRegistration: trạm, ngăn lộ, mục kết quả, tổ, người ký theo giấy ĐKCT', () => {
  const reg = { id: 'DK-1', data: { workContent: { text: 'TNĐK ngăn MC 212' }, workLocation: 'Trạm 220kV Hàm Tân',
    header: { teamName: 'Tổ Thí nghiệm điện Lâm Đồng', unitName: 'Đội Sửa chữa, thí nghiệm điện 3' }, signatoryName: 'Hoàng Trần Quản Trọng' } };
  const d = confirmationFromRegistration(reg, { id: 'TBA-1', name: 'TBA 220kV Hàm Tân' });
  assert.deepEqual(d.station, { substationId: 'TBA-1', name: 'TBA 220kV Hàm Tân' });
  assert.equal(d.bays, 'MC 212');
  assert.equal(d.workObject, 'MC 212');
  assert.deepEqual(d.items, [{ text: 'Thí nghiệm định kỳ ngăn MC 212', result: 'đạt' }]);
  assert.equal(d.signer, 'Hoàng Trần Quản Trọng');
  assert.equal(d.registrationId, 'DK-1');
  const noSub = confirmationFromRegistration({ id: 'DK-2', data: { workContent: { text: 'Vệ sinh cách điện' }, workLocation: 'TBA lạ' } }, null);
  assert.deepEqual(noSub.station, { substationId: null, name: 'TBA lạ' });
  assert.equal(noSub.workObject, 'Vệ sinh cách điện', 'không có mã thiết bị thì dùng nội dung');
});

test('shortDate / placeDate', () => {
  assert.equal(shortDate('2026-09-07'), '7/9/2026');
  assert.equal(placeDate('Khánh Hòa', '2026-09-07'), 'Khánh Hòa, ngày 07 tháng 09 năm 2026');
  assert.equal(placeDate('', null), '……, ngày … tháng … năm ……');
});

test('renderConfirmationDocx: điền đủ nội dung như mẫu, mục kết quả đánh số, không còn chú thích hay thẻ', () => {
  const { data } = normalizeConfirmation(CONFIRMATION, ctx);
  const zip = new PizZip(renderConfirmationDocx({ docNumber: '5/GXN-TNLĐ', data }));
  const xml = zip.file('word/document.xml').asText();
  const header = plain(zip.file('word/header1.xml').asText());
  assert.match(header, /Số: 5\/GXN-TNLĐ/);
  const ps = paragraphs(xml);
  for (const line of ['CÔNG TY TRUYỀN TẢI ĐIỆN 3', 'ĐỘI SỬA CHỮA, THÍ NGHIỆM ĐIỆN 3', 'Tên dự án / Tên trạm (Project): Trạm 220kV Hàm Tân',
    'Ngăn lộ: MC 212', 'Ghi chú: Đã tháo tiếp địa di động.', 'Lâm Đồng, ngày 27 tháng 09 năm 2026', 'Tổ Thí nghiệm điện Lâm Đồng', 'Hoàng Trần Quản Trọng',
    'Bằng giấy này, tôi xác nhận máy cắt MC 212, TI 212 đủ điều kiện đóng điện vận hành./.']) {
    assert.ok(ps.includes(line), line);
  }
  assert.ok(ps.some(p => p.includes('Ngày 27/9/2026, toán công tác thuộc Tổ Thí nghiệm điện Lâm Đồng – Đội Sửa chữa, thí nghiệm điện 3 đã thực hiện công tác thí nghiệm MC 212')));
  assert.ok(ps.includes('Thí nghiệm định kỳ máy cắt MC 212, các hạng mục theo QĐ 1901:\tđạt'));
  assert.ok(ps.includes('Thí nghiệm TI 212:\tđạt'));
  // hai mục cùng danh sách đánh số của mẫu
  assert.equal((xml.match(/<w:numId w:val="20"\/>/g) || []).length, 2);
  assert.doesNotMatch(plain(xml) + header, /[<>]|tự động|nhập tay|option/);
  assert.doesNotMatch(xml, /\{[#/@^]?[\w.]+\}/);
});
