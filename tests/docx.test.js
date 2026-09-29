const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const { toDocxView, formatDateTimeVi, splitHeaderLine } = require('../server/services/docxView');
const { renderRegistrationDocx } = require('../server/services/docxRender');

const { REG } = require('./fixtures/sampleRegistration');

test('formatDateTimeVi: "07 giờ 00 ngày 25 tháng 09 năm 2026"', () => {
  assert.equal(formatDateTimeVi('2026-09-25T07:00'), '07 giờ 00 ngày 25 tháng 09 năm 2026');
  assert.equal(formatDateTimeVi(null), '..... giờ ..... ngày ..... tháng ..... năm .....');
});

test('splitHeaderLine: tách tên đơn vị thành 2 dòng như mẫu', () => {
  assert.deepEqual(splitHeaderLine('Đội Sửa chữa, thí nghiệm điện 3'), ['ĐỘI SỬA CHỮA,', 'THÍ NGHIỆM ĐIỆN 3']);
  assert.deepEqual(splitHeaderLine('Tổ Thí nghiệm điện Lâm Đồng'), ['TỔ THÍ NGHIỆM ĐIỆN', 'LÂM ĐỒNG']);
  assert.deepEqual(splitHeaderLine('Tổ TĐH'), ['TỔ TĐH', '']);
});

test('toDocxView: các mục 1–12 theo đúng cách ghi của mẫu', () => {
  const v = toDocxView(REG);
  assert.equal(v.docNumber, '215/ĐK-TNLĐ');
  assert.equal(v.day, '23');
  assert.equal(v.month, '9');
  assert.equal(v.year, '2026');
  assert.equal(v.recipientName, 'Tổ thao tác lưu động Phan Thiết');
  assert.equal(v.startText, '07 giờ 00 ngày 25 tháng 09 năm 2026');
  assert.equal(v.workUnitCount, '02');
  assert.equal(v.workerCountsLine, '6.1) 02/ng; 6.2) 01/ng (Ngăn MC112, 10:00 25/09/2026 - 23:00 25/09/2026)');
  assert.equal(v.leaderName, '....................................');
  assert.equal(v.leaderLevel, '.../5');
  assert.equal(v.supervisorsLine, '8.1) Lê Giám Sát - Bậc ATĐ 4/5');
  assert.equal(v.commandersLine, '9.1) Trần Văn Hoàng - Bậc ATĐ 5/5; 9.2) Ngô Văn Quang - Bậc ATĐ 5/5');
  assert.equal(v.watchmanName, '.................................................');
  assert.equal(v.otherUnitsLine, '12.1. Tổ Vận hành TBA Phan Thiết');
  assert.equal(v.permits[0].permitNo, '01\n(ĐVCT1)');
  assert.equal(v.permits[0].workers, '- Kim Văn Quỳnh\n- Trần Phúc Linh');
  assert.equal(v.nominees[1].card, '3/5');
});

test('toDocxView: tên đơn vị trong câu "Căn cứ" bỏ phần trống', () => {
  assert.equal(toDocxView(REG).orgName, 'Tổ Thí nghiệm điện Lâm Đồng - Đội Sửa chữa, thí nghiệm điện 3');
  const v = toDocxView({ docNumber: '1', data: { ...REG.data, header: { ...REG.data.header, unitName: '' } } });
  assert.equal(v.orgName, 'Tổ Thí nghiệm điện Lâm Đồng');
});

test('toDocxView: mục trống in dòng chấm như mẫu', () => {
  const v = toDocxView({ docNumber: '', data: { ...REG.data, supervisors: [], otherUnits: [], nominees: [], permits: [], risks: [] } });
  assert.equal(v.supervisorsLine, '8.1) .................................... Bậc ATĐ .../5');
  assert.equal(v.otherUnitsLine, '12.1. ..................................    12.2. ..................................');
  assert.equal(v.docNumber, '.....');
});

function documentXml(buffer) {
  return new PizZip(buffer).file('word/document.xml').asText();
}
const plain = (xml) => xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, '');

test('renderRegistrationDocx: sinh DOCX từ mẫu, không còn thẻ, đúng nội dung và thoát ký tự XML', () => {
  const buffer = renderRegistrationDocx(REG);
  assert.ok(buffer.length > 10000);
  const xml = documentXml(buffer);
  const text = plain(xml);
  assert.doesNotMatch(text, /\{[#/]?[a-zA-Z]+\}/, 'không còn thẻ chưa thay');
  assert.match(text, /Số: 215\/ĐK-TNLĐ/);
  assert.match(text, /Kính gửi: Tổ thao tác lưu động Phan Thiết/);
  assert.match(text, /Bắt đầu: 07 giờ 00 ngày 25 tháng 09 năm 2026/);
  assert.match(xml, /Thay thế MC 174 &amp; DCL &lt;174-1&gt;/, 'ký tự đặc biệt được thoát');
  assert.match(text, /9\. Người CHTT: 9\.1\) Trần Văn Hoàng/);
  assert.match(text, /ĐỘI SỬA CHỮA,/);
  assert.match(text, /- Thí nghiệm nhất thứ\n- TNĐK 2027/, 'xuống dòng trong ô bảng');
  // 2 người đề cử -> 2 hàng, 1 phiếu, 1 rủi ro
  assert.equal((text.match(/Nhân viên đơn vị công tác 1/g) || []).length, 1);
  assert.equal((text.match(/Chỉ huy trực tiếp đơn vị công tác 1/g) || []).length, 1);
  assert.equal((text.match(/Phóng điện cảm ứng/g) || []).length, 1);
});

test('toDocxView: chỉ 1 ĐVCT thì không đánh số (mục 6, 9, phiếu 11.b, nhiệm vụ 11.a)', () => {
  const one = {
    ...REG.data,
    workUnits: [REG.data.workUnits[0]],
    nominees: [
      { person: REG.data.nominees[0].person, card: '5/5 _ 058', duty: 'Chỉ huy trực tiếp đơn vị công tác 1' },
      { person: REG.data.nominees[1].person, card: '3/5', duty: 'Lái xe chở người ĐVCT 1 (không tham gia nhóm công tác)' }
    ]
  };
  const v = toDocxView({ docNumber: '1', data: one });
  assert.equal(v.workUnitCount, '01');
  assert.equal(v.workerCountsLine, '02/ng');
  assert.equal(v.commandersLine, 'Trần Văn Hoàng - Bậc ATĐ 5/5');
  assert.equal(v.permits[0].permitNo, '01');
  assert.deepEqual(v.nominees.map(n => n.duty), ['Chỉ huy trực tiếp đơn vị công tác', 'Lái xe chở người ĐVCT (không tham gia nhóm công tác)']);
});

test('toDocxView: nhiều ĐVCT vẫn đánh số như mẫu', () => {
  const v = toDocxView(REG);
  assert.match(v.workerCountsLine, /^6\.1\) 02\/ng; 6\.2\)/);
  assert.match(v.commandersLine, /^9\.1\) .*; 9\.2\) /);
  assert.equal(v.permits[0].permitNo, '01\n(ĐVCT1)');
});
