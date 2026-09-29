const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseOutageTime,
  parseOutageMatrix,
  readOutageWorkbook
} = require('../server/services/outageExcel');

test('parseOutageTime: định dạng "DD/MM/YYYY HHhMM" của lịch cắt điện', () => {
  assert.equal(parseOutageTime('05/10/2024 07h00'), '2024-10-05T07:00');
  assert.equal(parseOutageTime('5/10/2024 7h30'), '2024-10-05T07:30');
  assert.equal(parseOutageTime(' 18/10/2024 06h30 '), '2024-10-18T06:30');
});

test('parseOutageTime: chỉ có giờ "HHh", dạng "HH:MM" và chỉ có ngày', () => {
  assert.equal(parseOutageTime('05/10/2024 07h'), '2024-10-05T07:00');
  assert.equal(parseOutageTime('05/10/2024 16:30'), '2024-10-05T16:30');
  assert.equal(parseOutageTime('05/10/2024'), '2024-10-05T00:00');
});

test('parseOutageTime: ô kiểu Date (exceljs trả giờ tường dưới dạng UTC) và số serial Excel', () => {
  assert.equal(parseOutageTime(new Date(Date.UTC(2024, 9, 5, 7, 0))), '2024-10-05T07:00');
  // 45570.2916667 = 05/10/2024 07:00
  assert.equal(parseOutageTime(45570 + 7 / 24), '2024-10-05T07:00');
});

test('parseOutageTime: giá trị rỗng hoặc sai trả null', () => {
  assert.equal(parseOutageTime(''), null);
  assert.equal(parseOutageTime(null), null);
  assert.equal(parseOutageTime('không rõ'), null);
  assert.equal(parseOutageTime('32/10/2024 07h00'), null);
  assert.equal(parseOutageTime('05/10/2024 25h00'), null);
});

const TEN_COLUMN_HEADER = [
  ['LỊCH CẮT ĐIỆN'],
  ['Từ ngày 05/10/2024 - 31/10/2024'],
  [],
  ['Thời gian đăng ký', null, 'Thời gian thực tế', null, 'Địa điểm', 'Nội dung', 'Phạm vi', 'Đơn vị đăng ký', 'Đơn vị công tác', 'Tình trạng đăng ký'],
  ['Bắt đầu', 'Kết thúc', 'Bắt đầu', 'Kết thúc']
];

test('parseOutageMatrix: mẫu 10 cột (có thời gian thực tế), giữ xuống dòng, trim', () => {
  const { rows, errors } = parseOutageMatrix([
    ...TEN_COLUMN_HEADER,
    ['05/10/2024 05h00', '07/10/2024 22h00', '05/10/2024 05h30', null, ' trạm 220kV Tuy Hòa. ', 'Thay thế MBA AT1',
      '- Cô lập MBA AT1\r\n- MC 231, 131 ', 'Đ2', 'Đ2, TTDVKT3', 'Đã có lịch công tác A3 ']
  ]);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.sourceRow, 6);
  assert.equal(r.regStart, '2024-10-05T05:00');
  assert.equal(r.regEnd, '2024-10-07T22:00');
  assert.equal(r.actualStart, '2024-10-05T05:30');
  assert.equal(r.actualEnd, null);
  assert.equal(r.location, 'trạm 220kV Tuy Hòa.');
  assert.equal(r.content, 'Thay thế MBA AT1');
  assert.equal(r.scope, '- Cô lập MBA AT1\n- MC 231, 131');
  assert.equal(r.registrationUnit, 'Đ2');
  assert.equal(r.workUnit, 'Đ2, TTDVKT3');
  assert.equal(r.status, 'Đã có lịch công tác A3');
  assert.match(r.rowHash, /^[0-9a-f]{40}$/);
});

test('parseOutageMatrix: mẫu 8 cột "Thời gian bắt đầu / kết thúc"', () => {
  const { rows, errors } = parseOutageMatrix([
    ['LỊCH CẮT ĐIỆN'],
    [],
    ['Thời gian bắt đầu', 'Thời gian kết thúc', 'Địa điểm', 'Nội dung', 'Phạm vi', 'Đơn vị đăng ký', 'Đơn vị công tác', 'Tình trạng đăng ký'],
    [],
    ['02/11/2024 16h00', '02/11/2024 22h00', 'trạm 220kV Chư Sê.', 'Cải tạo mạch ngăn 174', 'Cô lập MC 174', 'Đ4', 'Đ4', 'Đã có lịch']
  ]);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].regStart, '2024-11-02T16:00');
  assert.equal(rows[0].actualStart, null);
  assert.equal(rows[0].scope, 'Cô lập MC 174');
  assert.equal(rows[0].sourceRow, 5);
});

test('parseOutageMatrix: bỏ dòng trống, báo lỗi theo số dòng, loại dòng trùng trong cùng file', () => {
  const good = ['05/10/2024 07h00', '05/10/2024 17h00', null, null, 'Trạm A', 'Việc A', 'Cô lập A', 'Đ1', 'Đ1', 'OK'];
  const { rows, errors, duplicates } = parseOutageMatrix([
    ...TEN_COLUMN_HEADER,
    good,
    [null, null, null, null, null, null, null, null, null, null],
    ['sai giờ', '05/10/2024 17h00', null, null, 'Trạm B', 'Việc B', '', 'Đ1', 'Đ1', ''],
    ['05/10/2024 07h00', '05/10/2024 17h00', null, null, 'Trạm C', '', '', '', '', ''],
    ['05/10/2024 17h00', '05/10/2024 07h00', null, null, 'Trạm D', 'Việc D', '', '', '', ''],
    [...good]
  ]);
  assert.equal(rows.length, 1);
  assert.equal(duplicates, 1);
  assert.deepEqual(errors.map(e => e.row), [8, 9, 10]);
  assert.match(errors[0].message, /bắt đầu/i);
  assert.match(errors[1].message, /nội dung/i);
  assert.match(errors[2].message, /kết thúc/i);
});

test('parseOutageMatrix: không tìm thấy dòng tiêu đề thì ném lỗi rõ ràng', () => {
  assert.throws(() => parseOutageMatrix([['a', 'b'], ['c', 'd']]), /tiêu đề/);
});

test('parseOutageMatrix: rowHash ổn định theo nội dung, không theo số dòng', () => {
  const row = ['05/10/2024 07h00', '05/10/2024 17h00', null, null, 'Trạm A', 'Việc A', 'Cô lập A', 'Đ1', 'Đ1', 'OK'];
  const a = parseOutageMatrix([...TEN_COLUMN_HEADER, row]).rows[0];
  const b = parseOutageMatrix([...TEN_COLUMN_HEADER, [], [], row]).rows[0];
  assert.equal(a.rowHash, b.rowHash);
  const changed = parseOutageMatrix([...TEN_COLUMN_HEADER, [...row.slice(0, 5), 'Việc khác', ...row.slice(6)]]).rows[0];
  assert.notEqual(a.rowHash, changed.rowHash);
});

test('readOutageWorkbook: đọc file lịch cắt điện thật (64 dòng dữ liệu)', async () => {
  const buffer = fs.readFileSync(path.join(__dirname, 'fixtures', 'lichcatdien-sample.xlsx'));
  const { rows, errors } = await readOutageWorkbook(buffer);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 64);
  assert.equal(rows[0].regStart, '2024-10-05T07:00');
  assert.equal(rows[0].location, 'trạm 220kV Quy Nhơn.');
  assert.ok(rows[0].scope.includes('\n'), 'phạm vi nhiều dòng giữ nguyên xuống dòng');
  const tuyHoa = rows.find(r => r.location.includes('Tuy Hòa'));
  assert.equal(tuyHoa.actualStart, '2024-10-05T05:30');
});

test('parseOutageTime: ô chỉ có giờ (serial < 1) không được hiểu thành năm 1899', () => {
  assert.equal(parseOutageTime(0.5), null);
});

test('readOutageWorkbook: file có ô ở XFD1048576 (bom bộ nhớ) bị từ chối nhanh, không làm sập tiến trình', async () => {
  const XLSX = require('xlsx');
  const PizZip = require('pizzip');
  // tạo file nhỏ rồi chèn một ô ở góc xa nhất (không khai <dimension>) — y như file tấn công thật
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'S');
  const zip = new PizZip(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  const xml = zip.file('xl/worksheets/sheet1.xml').asText()
    .replace(/<dimension[^>]*\/>/, '')
    .replace('</sheetData>', '<row r="1048576"><c r="XFD1048576" t="inlineStr"><is><t>y</t></is></c></row></sheetData>');
  zip.file('xl/worksheets/sheet1.xml', xml);
  const started = Date.now();
  await assert.rejects(readOutageWorkbook(zip.generate({ type: 'nodebuffer' })), /quá lớn|tiêu đề/);
  assert.ok(Date.now() - started < 3000);
});

test('readOutageWorkbook: nội dung không phải xlsx/xls (vd CSV đổi đuôi) bị từ chối', async () => {
  await assert.rejects(readOutageWorkbook(Buffer.from('a,b\n1,2\n')), /Excel/);
});
