const test = require('node:test');
const assert = require('node:assert/strict');
const { docxFileName } = require('../server/services/fileName');

test('tên file Word: yyyymmdd_Số_Loại_NgănLộ_Trạm, bỏ dấu, "/" và khoảng trắng thành "-"', () => {
  assert.equal(docxFileName('plan', { date: '2026-10-05', number: '3/PA-TNKH.Nhatthu', bays: 'AT1, 231', station: 'TBA 220kV Tháp Chàm' }),
    '20261005_3-PA-TNKH.Nhatthu_PA_AT1-231_TBA-220kV-Thap-Cham.docx');
  assert.equal(docxFileName('registration', { date: '2026-10-05T07:00', number: '12/ĐK-TNLĐ', bayText: 'TNĐK MC 231, DCL 231-1 và 231', station: 'TBA 500kV Đăk Nông' }),
    '20261005_12-DK-TNLD_DKCT_MC-231-DCL-231-1_TBA-500kV-Dak-Nong.docx');
});

test('tên file Word: phần trống thì bỏ (biên bản không có số, chưa ghi ngăn lộ); "Trạm biến áp" viết TBA', () => {
  assert.equal(docxFileName('survey', { date: '2026-07-21T09:30', bayText: 'Không có thiết bị', station: 'Trạm biến áp 220kV Bảo Lộc' }),
    '20260721_BBKSHT_TBA-220kV-Bao-Loc.docx');
  assert.equal(docxFileName('confirmation', {}), 'GXN.docx');
});
