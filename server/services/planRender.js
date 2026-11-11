/**
 * Điền Phương án vào mẫu Word templates/template_pa.docx (sinh bằng scripts/tag_pa.py);
 * Phụ lục IV chèn ảnh các sơ đồ trạm đã chọn (danh mục Trạm biến áp), mỗi sơ đồ một trang khổ dọc.
 * Phụ lục người lập đính kèm (file Word) ghép vào cuối, mỗi file từ trang mới; mục 3 ghi "Chi tiết thực hiện: theo … đính kèm."
 */
const fs = require('node:fs');
const path = require('node:path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { toPlanView } = require('./planView');
const { imageInfo, fitImage, imageParagraphXml, addImagePart } = require('./surveyRender');
const { DEFAULT_DRAWING_LABEL } = require('../schema');
const { isolationDevices } = require('./plan');
const { appendDocx } = require('./docxAppend');
const { DEFAULTS: ORG_DEFAULTS } = require('./orgNames');

const DEFAULT_SIGN_TITLE = ORG_DEFAULTS.leadSignTitle;

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'templates', 'template_pa.docx');
// vùng in khổ A4 dọc của mẫu (lề trái 1701, phải 851 twip); cao ~ 2/3 trang để còn tiêu đề phụ lục
const MAX_CX = (11907 - 1701 - 851) * 635;
const MAX_CY = 8200000;
let templateBinary = null;

/** Mẫu: Buffer (mẫu tải lên, xem services/templateStore.js), đường dẫn khác, hoặc mẫu gốc (mặc định, giữ trong bộ nhớ). */
function loadTemplate(templatePath = TEMPLATE_PATH) {
  if (Buffer.isBuffer(templatePath)) return templatePath.toString('binary');
  if (templatePath !== TEMPLATE_PATH) return fs.readFileSync(templatePath, 'binary');
  templateBinary = templateBinary || fs.readFileSync(TEMPLATE_PATH, 'binary');
  return templateBinary;
}

const NO_DRAWING = '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>(Chưa có bản vẽ sơ đồ của trạm trong danh mục.)</w:t></w:r></w:p>';
const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const caption = (label) => '<w:p><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="120"/><w:jc w:val="center"/></w:pPr>'
  + `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${xmlEscape(label)}</w:t></w:r></w:p>`;

// Bảng "Thiết bị cần thí nghiệm" (mục 3, phần "Thực hiện:"): vừa vùng in khổ dọc, chữ cỡ thân văn bản (13)
const EQUIP_COLS = [
  { title: 'STT', w: 750, center: true },
  { title: 'Tên thiết bị', w: 2800 },
  { title: 'Ký hiệu / vị trí', w: 2700 },
  { title: 'Hạng mục / Ghi chú', w: 11907 - 1701 - 851 - 750 - 2800 - 2700 }
];
const TNR = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';
const EQUIP_INTRO = 'Thiết bị cần thí nghiệm:';
/** "Chi tiết thực hiện: theo Phụ lục V đính kèm." (labels: tên các phụ lục đính kèm); không có -> ''. */
const detailText = (labels) => (labels?.length ? `Chi tiết thực hiện: theo ${labels.join(', ')} đính kèm.` : '');
const plainParagraph = (text) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;

/** Một ô bảng: chữ (xuống dòng giữ nguyên), in đậm/căn giữa tùy chọn. */
function cellXml(value, { w, center = false, bold = false }) {
  const runs = String(value ?? '').split(/\r?\n/).map((line, i) => (i ? '<w:br/>' : '') + `<w:t xml:space="preserve">${xmlEscape(line)}</w:t>`).join('');
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>`
    + `<w:p><w:pPr><w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="0"/>${center ? '<w:jc w:val="center"/>' : ''}</w:pPr>`
    + `<w:r><w:rPr>${TNR}${bold ? '<w:b/>' : ''}<w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr>${runs}</w:r></w:p></w:tc>`;
}

/** Bảng chi tiết thiết bị cần thí nghiệm (rows: [{ name, position, note }]); rỗng -> ''. */
function testEquipmentXml(rows) {
  if (!rows?.length) return '';
  const border = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join('');
  const head = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${EQUIP_COLS.map(c => cellXml(c.title, { w: c.w, center: true, bold: true })).join('')}</w:tr>`;
  const body = rows.map((r, i) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${[i + 1, r.name, r.position, r.note]
    .map((v, k) => cellXml(v, { w: EQUIP_COLS[k].w, center: EQUIP_COLS[k].center })).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${EQUIP_COLS.reduce((s, c) => s + c.w, 0)}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${border}</w:tblBorders>`
    + '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>'
    + `<w:tblGrid>${EQUIP_COLS.map(c => `<w:gridCol w:w="${c.w}"/>`).join('')}</w:tblGrid>${head}${body}</w:tbl>`
    + '<w:p><w:pPr><w:spacing w:before="0" w:after="60"/></w:pPr></w:p>';
}

const paragraphText = (p) => (p.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('');

/**
 * Đoạn dẫn "✓ Thiết bị cần thí nghiệm:" cùng kiểu với đoạn mẫu (giữ định dạng đoạn — gạch đầu dòng ✓, thụt lề —
 * và định dạng chữ của run đầu, bỏ nghiêng), giữ liền với bảng bên dưới.
 */
function introParagraph(sample, text, keepNext = true) {
  let pPr = (sample.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || ['<w:pPr></w:pPr>'])[0];
  if (keepNext && !/<w:keepNext\/>/.test(pPr)) {
    pPr = /<w:pStyle [^>]*\/>/.test(pPr)
      ? pPr.replace(/(<w:pStyle [^>]*\/>)/, '$1<w:keepNext/>')
      : pPr.replace('<w:pPr>', '<w:pPr><w:keepNext/>');
  }
  const run = sample.slice(sample.indexOf('</w:pPr>') + 1).match(/<w:r[ >][\s\S]*?<\/w:r>/);
  const rPr = run ? (run[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0].replace(/<w:i\/>|<w:iCs\/>/g, '') : '';
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

/**
 * Mẫu không có thẻ {@testEquipmentXml}: trong phần "Thực hiện:" của mục "Phương án thực hiện", sau đoạn
 * "Kiểm tra thí nghiệm các hạng mục thiết bị nhất thứ …" thêm đoạn "✓ Thiết bị cần thí nghiệm:" và bảng (nếu có),
 * rồi đoạn "✓ Chi tiết thực hiện: theo Phụ lục … đính kèm." (detail, nếu có) cùng kiểu.
 * Không thấy đoạn đó: sau đoạn "Kiểm tra:" (cách đặt cũ); không thấy nữa thì để nguyên văn bản.
 */
function insertAfterCheckLine(xml, tableXml, detail = '') {
  const paras = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(m => ({ m, txt: paragraphText(m[0]).replace(/\s+/g, ' ').trim() }));
  const section = paras.findIndex(p => /Phương án thực hiện/i.test(p.txt));
  if (section < 0) return xml;
  const doing = paras.findIndex((p, i) => i > section && /^-?\s*Thực hiện\s*:?$/i.test(p.txt));
  const test = doing < 0 ? -1 : paras.findIndex((p, i) => i > doing && /^Kiểm tra thí nghiệm các hạng mục/i.test(p.txt));
  if (test >= 0) {
    const { m } = paras[test];
    const at = m.index + m[0].length;
    return xml.slice(0, at) + (tableXml ? introParagraph(m[0], EQUIP_INTRO) + tableXml : '')
      + (detail ? introParagraph(m[0], detail, false) : '') + xml.slice(at);
  }
  const check = paras.findIndex((p, i) => i > section && /^-?\s*Kiểm tra\s*:?$/i.test(p.txt));
  if (check < 0) return xml;
  const at = paras[check].m.index + paras[check].m[0].length;
  return xml.slice(0, at) + tableXml + (detail ? plainParagraph(detail) : '') + xml.slice(at);
}

/** Thêm dấu "√" (căn giữa, như tiêu đề cột "Mở (√)" của mẫu) vào đoạn đầu của một ô bảng. */
function markCell(cell) {
  let out = cell;
  if (/<w:pPr>/.test(out)) {
    if (!/<w:jc /.test(out)) out = out.replace('</w:pPr>', '<w:jc w:val="center"/></w:pPr>');
  } else {
    out = out.replace(/<w:p(\s[^>]*)?>/, (m) => `${m}<w:pPr><w:jc w:val="center"/></w:pPr>`);
  }
  return out.replace('</w:p>', `<w:r><w:rPr>${TNR}<w:b/></w:rPr><w:t>√</w:t></w:r></w:p>`);
}

/**
 * Phụ lục I.1 — bảng trạng thái cô lập (STT | Thiết bị | Tiếp nhận: Mở, Đóng | Giao trả: Mở, Đóng):
 * đánh dấu "√" theo trạng thái từng thiết bị (devices: [{ receive, handover }] theo thứ tự dòng).
 * Nhận bảng theo tiêu đề "Khi tiếp nhận hiện trường"; không thấy thì giữ nguyên.
 */
function markIsolationTable(xml, devices) {
  const at = xml.indexOf('Khi tiếp nhận hiện trường');
  if (at < 0 || !devices?.length) return xml;
  const start = xml.lastIndexOf('<w:tbl>', at);
  const end = xml.indexOf('</w:tbl>', at);
  if (start < 0 || end < 0) return xml;
  const rows = [...xml.slice(start, end).matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)];
  // dòng dữ liệu: sau dòng tiêu đề có "Đóng" (tiêu đề 2 tầng)
  const head = rows.findIndex(r => /Đóng/.test(paragraphText(r[0])));
  if (head < 0) return xml;
  let table = xml.slice(start, end);
  // thay từ dòng cuối lên để vị trí các dòng trước không đổi
  for (let i = rows.length - 1; i > head; i--) {
    const d = devices[i - head - 1];
    if (!d) continue;
    const want = [null, null, d.receive === 'open', d.receive === 'closed', d.handover === 'open', d.handover === 'closed'];
    let c = -1;
    const row = rows[i][0].replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (cell) => { c += 1; return want[c] ? markCell(cell) : cell; });
    table = table.slice(0, rows[i].index) + row + table.slice(rows[i].index + rows[i][0].length);
  }
  return xml.slice(0, start) + table + xml.slice(end);
}

/**
 * plan: { docNumber, data }; drawings: [{ label, buffer }] ảnh các sơ đồ trạm đã chọn (có thể rỗng).
 * Mỗi sơ đồ một trang, có tên sơ đồ phía trên (trừ tên mặc định "Sơ đồ trạm").
 * Bảng thiết bị cần thí nghiệm (data.testEquipment): tại thẻ {@testEquipmentXml} nếu mẫu có, không thì sau dòng "Kiểm tra:".
 * appendices: [{ label, buffer }] phụ lục đính kèm (file .docx) theo thứ tự, ghép vào cuối, mỗi file từ trang mới.
 */
function renderPlanDocx(plan, drawings = [], templatePath = TEMPLATE_PATH, appendices = []) {
  const zip = new PizZip(loadTemplate(templatePath));
  const hasEquipTag = /testEquipmentXml/.test(zip.file('word/document.xml')?.asText() || '');
  const equipXml = testEquipmentXml(plan?.data?.testEquipment);
  const files = (appendices || []).filter(a => a?.buffer);
  const detail = detailText(files.map(a => a.label));
  const images = drawings
    .map((d, i) => ({ ...d, info: d?.buffer ? imageInfo(d.buffer) : null, part: { relId: `rIdDkctStationDrawing${i + 1}`, name: `dkct_station_drawing_${i + 1}`, docPrId: 9201 + i } }))
    .filter(d => d.info);
  const drawingXml = images.map((d, i) => (i ? PAGE_BREAK : '')
    + (d.label && d.label !== DEFAULT_DRAWING_LABEL ? caption(d.label) : '')
    + imageParagraphXml(fitImage(d.info.width, d.info.height, MAX_CX, MAX_CY), d.info.type, d.part)).join('');
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
  doc.render({ ...toPlanView(plan), drawingXml: drawingXml || NO_DRAWING,
    testEquipmentXml: (equipXml + (detail ? plainParagraph(detail) : '')) || '<w:p/>' });
  const out = doc.getZip();
  let xml = out.file('word/document.xml').asText();
  if ((equipXml || detail) && !hasEquipTag) xml = insertAfterCheckLine(xml, equipXml, detail);
  xml = markIsolationTable(xml, isolationDevices(plan?.data?.isolationDevices));
  // chức danh người ký (Cài đặt → Tên đơn vị, chức danh; lưu theo phương án): thay chữ có sẵn của mẫu
  const signTitle = String(plan?.data?.header?.leadSignTitle || '').trim();
  if (signTitle && signTitle !== DEFAULT_SIGN_TITLE) xml = xml.split(`<w:t>${DEFAULT_SIGN_TITLE}</w:t>`).join(`<w:t xml:space="preserve">${xmlEscape(signTitle)}</w:t>`);
  out.file('word/document.xml', xml);
  for (const d of images) addImagePart(out, d.buffer, d.info.type, d.part);
  files.forEach((a, i) => appendDocx(out, a.buffer, i + 1));
  return out.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { renderPlanDocx, testEquipmentXml, insertAfterCheckLine, markIsolationTable, detailText, TEMPLATE_PATH };
