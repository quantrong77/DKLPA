const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const { appendDocx, isDocx } = require('../server/services/docxAppend');
const { renderPlanDocx } = require('../server/services/planRender');
const { isLegacyDoc } = require('../server/services/docConvert');
const { attachment } = require('../server/services/fileName');
const { normalizePlan, attachmentLabel } = require('../server/services/plan');
const { PLAN } = require('./fixtures/samplePlan');
const { makeAppendixDocx, assertBalanced } = require('./helpers/appendixDocx');

const plain = (xml) => xml.replace(/<[^>]+>/g, '');
const ctx = { personnel: new Map(), substations: new Map() };

test('appendDocx: ghép phụ lục từ trang mới, giữ khổ ngang, chép ảnh / kiểu / đánh số, bỏ chú thích cuối trang', () => {
  const main = new PizZip(renderPlanDocx({ docNumber: '1/PA', data: PLAN }));
  const before = main.file('word/document.xml').asText();
  const mainSect = before.slice(before.lastIndexOf('<w:sectPr'), before.lastIndexOf('</w:body>'));
  appendDocx(main, makeAppendixDocx(), 1);
  const out = new PizZip(main.generate({ type: 'nodebuffer' }));
  const xml = out.file('word/document.xml').asText();
  assertBalanced(xml);

  const text = plain(xml);
  assert.ok(text.indexOf('PHỤ LỤC V: CHI TIẾT THỰC HIỆN') > text.indexOf('Phụ lục III'), 'phụ lục ở cuối');
  // section của phương án kết thúc trong một đoạn ngay trước phụ lục (sang trang mới), section cuối khổ ngang của phụ lục
  const at = xml.indexOf('PHỤ LỤC V');
  const breakPara = xml.lastIndexOf('<w:p><w:pPr><w:sectPr', at);
  assert.ok(breakPara > 0 && xml.slice(breakPara, at).includes('w:w="11907"'), 'đoạn ngắt section mang khổ dọc của phương án');
  assert.ok(xml.slice(breakPara).includes(mainSect.match(/<w:footerReference [^>]*>/)[0]), 'giữ chân trang của phương án');
  const finalSect = xml.slice(xml.lastIndexOf('<w:sectPr'));
  assert.match(finalSect, /w:orient="landscape"/);

  // ảnh: quan hệ mới trỏ tới file đã chép, khai báo kiểu png
  const rid = xml.slice(at).match(/r:embed="([^"]+)"/)[1];
  assert.notEqual(rid, 'rId4');
  const rels = out.file('word/_rels/document.xml.rels').asText();
  const target = rels.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`))[1];
  assert.ok(out.file(`word/${target}`), `có file ${target}`);
  assert.match(out.file('[Content_Types].xml').asText(), /Extension="png"/);
  assert.match(rels, /Target="https:\/\/evnnpt\.vn\/" TargetMode="External"/, 'liên kết ngoài');
  // mã hình không trùng hình của phương án
  const ids = [...xml.matchAll(/<wp:docPr\b[^>]*\sid="(\d+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);

  // kiểu riêng chép kèm kiểu gốc; Normal giữ của phương án
  const styles = out.file('word/styles.xml').asText();
  assert.match(styles, /w:styleId="PLTitle"/);
  assert.match(styles, /w:styleId="PLBase"/);
  assert.equal((styles.match(/w:styleId="Normal"/g) || []).length, 1);

  // danh sách đánh số: mã mới, trỏ tới abstractNum mới, abstractNum đứng trước mọi w:num
  const numId = xml.slice(at).match(/<w:numId w:val="(\d+)"/)[1];
  const numbering = out.file('word/numbering.xml').asText();
  assertBalanced(numbering);
  const num = numbering.match(new RegExp(`<w:num\\b[^>]*w:numId="${numId}"[^>]*>[\\s\\S]*?</w:num>`))[0];
  const absId = num.match(/<w:abstractNumId w:val="(\d+)"/)[1];
  assert.match(numbering, new RegExp(`<w:abstractNum\\b[^>]*w:abstractNumId="${absId}"[^>]*>[\\s\\S]*?%1\\.`));
  assert.ok(numbering.lastIndexOf('<w:abstractNum ') < numbering.indexOf('<w:num '), 'abstractNum trước num');

  // bỏ chú thích cuối trang và mã đoạn w14 của file ghép
  assert.doesNotMatch(xml.slice(at), /footnoteReference/);
  assert.doesNotMatch(xml, /1A2B3C4D/);
});

test('appendDocx: ghép nhiều file không trùng tên phần; file không phải .docx báo lỗi 422', () => {
  const main = new PizZip(renderPlanDocx({ docNumber: '1/PA', data: PLAN }));
  appendDocx(main, makeAppendixDocx('PHỤ LỤC V'), 1);
  appendDocx(main, makeAppendixDocx('PHỤ LỤC VI'), 2);
  const xml = main.file('word/document.xml').asText();
  assertBalanced(xml);
  assert.ok(plain(xml).indexOf('PHỤ LỤC VI') > plain(xml).indexOf('PHỤ LỤC V'));
  const media = Object.keys(main.files).filter(f => /^word\/media\/dkctpl\d_image1\.png$/.test(f));
  assert.equal(media.length, 2);
  assert.throws(() => appendDocx(main, Buffer.from('không phải docx'), 3), { status: 422 });
  assert.equal(isDocx(makeAppendixDocx()), true);
  assert.equal(isDocx(Buffer.from('abc')), false);
  assert.equal(isLegacyDoc(Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0])), true);
  assert.equal(isLegacyDoc(makeAppendixDocx()), false);
});

test('appendDocx: file Word thật (mã hình gần 2^31, numIdMacAtCleanup, đầu trang riêng) — Word mở được', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const real = (name) => fs.readFileSync(path.join(__dirname, '..', 'templates', name));
  const main = new PizZip(renderPlanDocx({ docNumber: '1/PA', data: PLAN }));
  appendDocx(main, real('template_gxn.source.docx'), 1); // có đầu trang
  appendDocx(main, makeAppendixDocx(), 2); // không có đầu / chân trang
  appendDocx(main, real('template_bbksht.source.docx'), 3); // hình có mã lớn, đánh số trang bắt đầu lại
  const xml = main.file('word/document.xml').asText();
  assertBalanced(xml);
  // mã hình: số nguyên 32 bit có dấu (Word báo lỗi khi vượt 2147483647), không trùng
  const ids = [...xml.matchAll(/<wp:docPr\b[^>]*\sid="(\d+)"/g)].map(m => Number(m[1]));
  assert.ok(ids.every(id => id <= 2147483647), `mã hình ${Math.max(...ids)}`);
  assert.equal(new Set(ids).size, ids.length);
  // numIdMacAtCleanup luôn đứng cuối danh sách đánh số
  const numbering = main.file('word/numbering.xml').asText();
  if (/numIdMacAtCleanup/.test(numbering)) assert.ok(numbering.lastIndexOf('<w:num ') < numbering.indexOf('<w:numIdMacAtCleanup'));
  // mọi section sau phương án tự có đầu trang và chân trang (không lấy đầu trang của phụ lục trước); số trang đánh tiếp
  const sects = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g);
  assert.ok(sects.length >= 4);
  for (const s of sects.slice(1)) {
    assert.match(s, /<w:headerReference\b/);
    assert.match(s, /<w:footerReference\b/);
    assert.doesNotMatch(s, /<w:pgNumType\b[^>]*w:start=/);
  }
  const plan = sects[0].match(/<w:footerReference\b[^>]*w:type="default"[^>]*\/>/)[0];
  assert.ok(sects[2].includes(plan), 'phụ lục không có chân trang: dùng chân trang của phương án');
  const rels = main.file('word/_rels/document.xml.rels').asText();
  const emptyHeader = rels.match(/Id="(rIdDkctEmptyheader)"[^>]*Target="([^"]+)"/);
  assert.ok(emptyHeader && main.file(`word/${emptyHeader[2]}`), 'đầu trang trống cho phụ lục không có đầu trang');
  assert.match(main.file('[Content_Types].xml').asText(), /dkct_empty_header\.xml/);
});

test('renderPlanDocx: có phụ lục đính kèm thì sau bảng thiết bị cần thí nghiệm in "Chi tiết thực hiện: theo Phụ lục V đính kèm."', () => {
  const rows = [{ name: 'Máy cắt', position: 'MC 272', note: 'Định kỳ 3 năm' }];
  const buf = renderPlanDocx({ docNumber: '1/PA', data: { ...PLAN, testEquipment: rows } }, [], undefined,
    [{ label: 'Phụ lục V', buffer: makeAppendixDocx() }, { label: 'Phụ lục VI', buffer: makeAppendixDocx('PHỤ LỤC VI') }]);
  const xml = new PizZip(buf).file('word/document.xml').asText();
  assertBalanced(xml);
  const text = plain(xml);
  const table = text.indexOf('1Máy cắtMC 272');
  const detail = text.indexOf('Chi tiết thực hiện: theo Phụ lục V, Phụ lục VI đính kèm.');
  assert.ok(table > 0 && detail > table && detail < text.indexOf('Lưu ý'), 'sau bảng, trước "Lưu ý"');
  // cùng kiểu đầu dòng với đoạn "Kiểm tra thí nghiệm…", không giữ liền đoạn sau
  const paras = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g);
  const numPr = (p) => (p.match(/<w:numPr>[\s\S]*?<\/w:numPr>/) || [''])[0];
  const detailPara = paras.find(p => plain(p).startsWith('Chi tiết thực hiện'));
  assert.equal(numPr(detailPara), numPr(paras.find(p => plain(p).startsWith('Kiểm tra thí nghiệm các hạng mục'))));
  assert.doesNotMatch(detailPara, /<w:keepNext\/>/);
  assert.ok(text.indexOf('PHỤ LỤC VI') > text.indexOf('PHỤ LỤC V: CHI TIẾT'));

  // không có bảng thiết bị: vẫn in dòng chi tiết thực hiện, không in dòng "Thiết bị cần thí nghiệm:"
  const only = plain(new PizZip(renderPlanDocx({ docNumber: '1/PA', data: { ...PLAN, testEquipment: [] } }, [], undefined,
    [{ label: 'Phụ lục V', buffer: makeAppendixDocx() }])).file('word/document.xml').asText());
  assert.ok(only.includes('Chi tiết thực hiện: theo Phụ lục V đính kèm.'));
  assert.ok(!only.includes('Thiết bị cần thí nghiệm:'));
  // không có phụ lục: không in
  assert.ok(!plain(new PizZip(renderPlanDocx({ docNumber: '1/PA', data: PLAN })).file('word/document.xml').asText()).includes('Chi tiết thực hiện'));
});

test('normalizePlan: phụ lục đính kèm theo thứ tự, tên mặc định Phụ lục V, VI…, bỏ trùng', () => {
  const { data } = normalizePlan({ ...PLAN, attachments: [{ id: 'PL1', fileName: 'a.docx' }, { id: 'PL2', label: ' Phụ lục X ' }, { id: 'PL1' }, { label: 'không id' }] }, ctx);
  assert.deepEqual(data.attachments, [{ id: 'PL1', fileName: 'a.docx', label: 'Phụ lục V' }, { id: 'PL2', fileName: '', label: 'Phụ lục X' }]);
  assert.equal(attachmentLabel(2), 'Phụ lục VII');
  assert.deepEqual(normalizePlan(PLAN, ctx).data.attachments, []);
});

test('attachment: tên file có dấu -> filename= bỏ dấu (ASCII), filename*= giữ UTF-8', () => {
  const h = attachment('Phụ lục V "chi tiết".docx');
  assert.match(h, /filename="Phu luc V _chi tiet_\.docx"/);
  assert.match(h, /filename\*=UTF-8''Ph%E1%BB%A5%20l%E1%BB%A5c/);
  assert.doesNotMatch(h.split(';')[1], /[^\x20-\x7e]/);
});
