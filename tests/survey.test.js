const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const { makePng } = require('./helpers/png');
const { normalizeSurvey, surveyFromOutage } = require('../server/services/survey');
const { toSurveyView, formatSurveyTime, formatShortDate } = require('../server/services/surveyView');
const { renderSurveyDocx, imageInfo, fitImage } = require('../server/services/surveyRender');
const { SURVEY } = require('./fixtures/sampleSurvey');

const docXml = (buf) => new PizZip(buf).file('word/document.xml').asText();
const plain = (xml) => xml.replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '');

test('normalizeSurvey: giữ dữ liệu hợp lệ, bỏ dòng trống', () => {
  const { data, errors } = normalizeSurvey({
    ...SURVEY,
    workUnitReps: [...SURVEY.workUnitReps, { honorific: 'Bà', name: '  ', role: 'x' }],
    scopeItems: ['TU 275 - 3 pha', '', '  '],
    risks: [...SURVEY.risks, { hazard: '', measures: '', performer: 'Đơn vị công tác' }]
  }, { substations: new Map() });
  assert.deepEqual(errors, []);
  assert.equal(data.workUnitReps.length, 2);
  assert.deepEqual(data.scopeItems, ['TU 275 - 3 pha']);
  assert.equal(data.risks.length, 2);
  assert.equal(data.station.name, 'Trạm biến áp 220kV Tháp Chàm');
});

test('normalizeSurvey: bắt buộc thời gian, địa điểm, đại diện ĐVCT, thiết bị, nội dung', () => {
  const { errors } = normalizeSurvey({ header: {}, workUnitReps: [], station: {} }, { substations: new Map() });
  const fields = errors.map(e => e.field);
  for (const f of ['surveyTime', 'station', 'workUnitReps', 'equipment', 'workContent']) assert.ok(fields.includes(f), f);
});

test('normalizeSurvey: chọn TBA theo danh mục thì lấy tên và đơn vị QLVH từ danh mục; danh xưng chỉ Ông/Bà', () => {
  const substations = new Map([['TBA-1', { id: 'TBA-1', name: 'TBA 220kV Bảo Lộc', stationId: 'ST-1', unitName: 'Tổ Thao tác lưu động Bảo Lộc' }]]);
  const { data } = normalizeSurvey({ ...SURVEY, station: { substationId: 'TBA-1', name: 'sửa tay' },
    qlvhReps: [{ honorific: '<script>', name: 'Lê Văn A', role: 'Trạm trưởng' }] }, { substations });
  assert.deepEqual(data.station, { substationId: 'TBA-1', name: 'TBA 220kV Bảo Lộc', qlvhUnitId: 'ST-1', qlvhUnitName: 'Tổ Thao tác lưu động Bảo Lộc' });
  assert.equal(data.qlvhReps[0].honorific, 'Ông');
  const manual = normalizeSurvey({ ...SURVEY, station: { substationId: 'KHONG-CO', name: 'TBA tự ghi' } }, { substations }).data;
  assert.deepEqual(manual.station, { substationId: null, name: 'TBA tự ghi', qlvhUnitId: null, qlvhUnitName: '' });
});

test('normalizeSurvey: chặn danh sách quá dài', () => {
  const many = Array.from({ length: 101 }, (_, i) => ({ hazard: `h${i}`, measures: '', performer: '' }));
  const { data, errors } = normalizeSurvey({ ...SURVEY, risks: many }, { substations: new Map() });
  assert.equal(data, null);
  assert.equal(errors[0].field, 'risks');
});

test('surveyFromOutage: lấy nội dung, phạm vi, địa điểm từ dòng lịch cắt điện', () => {
  const d = surveyFromOutage({ id: 'LCD-1', location: 'TBA 220kV Tháp Chàm', content: 'Thí nghiệm TU275',
    scope: 'Cô lập MC275\nTU275', regStart: '2026-07-25T07:00' });
  assert.equal(d.outageId, 'LCD-1');
  assert.equal(d.station.name, 'TBA 220kV Tháp Chàm');
  assert.equal(d.workContent, 'Thí nghiệm TU275');
  assert.deepEqual(d.scopeItems, ['Cô lập MC275', 'TU275']);
});

test('formatSurveyTime / formatShortDate theo cách ghi của mẫu', () => {
  assert.equal(formatSurveyTime('2026-07-21T09:30'), '09h30’ ngày 21/7/2026');
  assert.equal(formatShortDate('2026-07-21'), '21/7/2026');
  assert.equal(formatSurveyTime(''), '.....h.....’ ngày ...../...../.....');
});

test('toSurveyView: dòng đại diện, chữ ký, tiêu đề sơ đồ', () => {
  const v = toSurveyView(SURVEY);
  assert.deepEqual([v.unitLine1, v.unitLine2], ['ĐỘI SỬA CHỮA,', 'THÍ NGHIỆM ĐIỆN 3']);
  assert.equal(v.teamUpper, 'TỔ THÍ NGHIỆM ĐIỆN LÂM ĐỒNG');
  assert.deepEqual(v.workUnitRepLines, ['1.1. Ông: Hoàng Trần Quản Trọng, Chức vụ: Tổ phó - Tổ TNLĐ', '1.2. Ông: Nguyễn Hữu Kính, Chức vụ: Tổ trưởng - Tổ TNLĐ']);
  assert.deepEqual(v.qlvhRepLines, ['2.1. Ông: Nguyễn Yên, Chức vụ: Tổ trưởng Tổ TTLĐ Tháp Chàm']);
  assert.equal(v.workUnitSigner, 'Hoàng Trần Quản Trọng');
  assert.equal(v.qlvhSigner, 'Nguyễn Yên');
  assert.equal(v.teamShortLabel, 'Tổ TNLĐ');
  assert.equal(v.diagramDateText, '21/7/2026');
});

test('toSurveyView: chưa có đại diện QLVH thì in dòng chấm như mẫu', () => {
  const v = toSurveyView({ ...SURVEY, qlvhReps: [], relatedUnits: '', scopeItems: [] });
  assert.deepEqual(v.qlvhRepLines, ['2.1. Ông (Bà): ................, Chức vụ: ............................']);
  assert.equal(v.qlvhSigner, '');
  assert.equal(v.relatedUnits, 'không');
  assert.deepEqual(v.scopeItems, ['..............................']);
});

test('imageInfo / fitImage: đọc kích thước PNG, JPEG; co giãn vừa khung giữ tỉ lệ', () => {
  assert.deepEqual(imageInfo(makePng(40, 20)), { type: 'png', width: 40, height: 20 });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03]);
  assert.deepEqual(imageInfo(jpeg), { type: 'jpeg', width: 600, height: 300 });
  assert.equal(imageInfo(Buffer.from('GIF89a')), null);
  assert.deepEqual(fitImage(2000, 1000, 1000, 800), { cx: 1000, cy: 500 });
  assert.deepEqual(fitImage(100, 400, 1000, 800), { cx: 200, cy: 800 });
});

test('renderSurveyDocx: điền đủ nội dung theo mẫu, không còn chữ hướng dẫn <...>', () => {
  const xml = docXml(renderSurveyDocx({ data: SURVEY }));
  const text = plain(xml);
  assert.match(text, /BIÊN BẢN KHẢO SÁT HIỆN TRƯỜNG/);
  assert.match(text, /Vào hồi 09h30’ ngày 21\/7\/2026, tại Trạm biến áp 220kV Tháp Chàm/);
  assert.match(text, /1\.2\. Ông: Nguyễn Hữu Kính, Chức vụ: Tổ trưởng - Tổ TNLĐ/);
  assert.match(text, /Ngăn 275: TU275, TI275 tại Trạm biến áp 220kV Tháp Chàm\./);
  assert.match(text, /TU 275 - 3 pha/);
  assert.match(text, /Cắt áp tô mát hạ thế TU275/);
  assert.match(text, /do Tổ TNLĐ lập ngày 21\/7\/2026/);
  // mỗi đại diện, mỗi phạm vi là một đoạn riêng
  const paragraphs = xml.split('</w:p>').map(plain).map(s => s.trim());
  for (const line of ['1.1. Ông: Hoàng Trần Quản Trọng, Chức vụ: Tổ phó - Tổ TNLĐ', '1.2. Ông: Nguyễn Hữu Kính, Chức vụ: Tổ trưởng - Tổ TNLĐ',
    '2.1. Ông: Nguyễn Yên, Chức vụ: Tổ trưởng Tổ TTLĐ Tháp Chàm', 'TU 275 - 3 pha', 'TI 275 - 3 pha']) {
    assert.ok(paragraphs.includes(line), line);
  }
  assert.doesNotMatch(text, /[<>]|nhập tay|pick chọn|Khu vực công tác/);
  assert.doesNotMatch(xml, /\{[#/@]?\w+\}/, 'không còn thẻ chưa điền');
  assert.doesNotMatch(xml, /r:embed="rId\d+"/, 'không còn ảnh sơ đồ mẫu');
});

test('renderSurveyDocx: chèn ảnh sơ đồ vào trang cuối (media, quan hệ, kiểu nội dung)', () => {
  const buf = renderSurveyDocx({ data: SURVEY }, { buffer: makePng(300, 150) });
  const zip = new PizZip(buf);
  const xml = zip.file('word/document.xml').asText();
  assert.match(xml, /<pic:pic[\s\S]*r:embed="rIdDkctDiagram"/);
  assert.ok(zip.file('word/media/dkct_diagram.png'));
  assert.match(zip.file('word/_rels/document.xml.rels').asText(), /Id="rIdDkctDiagram"[^>]*Target="media\/dkct_diagram\.png"/);
  assert.match(zip.file('[Content_Types].xml').asText(), /Extension="png"/);
  const [, cx, cy] = /<wp:inline[^>]*><wp:extent cx="(\d+)" cy="(\d+)"\/>[^]*?name="So do mot soi"/.exec(xml);
  assert.equal(Math.round(Number(cx) / Number(cy)), 2, 'giữ tỉ lệ ảnh');
});
