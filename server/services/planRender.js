/**
 * Điền Phương án vào mẫu Word templates/template_pa.docx (sinh bằng scripts/tag_pa.py);
 * Phụ lục IV chèn ảnh các sơ đồ trạm đã chọn (danh mục Trạm biến áp), mỗi sơ đồ một trang khổ dọc.
 */
const fs = require('node:fs');
const path = require('node:path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { toPlanView } = require('./planView');
const { imageInfo, fitImage, imageParagraphXml, addImagePart } = require('./surveyRender');
const { DEFAULT_DRAWING_LABEL } = require('../schema');

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

// Bảng "chi tiết thiết bị cần thí nghiệm" (mục 3, phần "- Kiểm tra:"): vừa vùng in khổ dọc
const EQUIP_COLS = [
  { title: 'STT', w: 700, center: true },
  { title: 'Tên thiết bị', w: 2900 },
  { title: 'Ký hiệu / vị trí', w: 2500 },
  { title: 'Hạng mục / Ghi chú', w: 11907 - 1701 - 851 - 700 - 2900 - 2500 }
];
const TNR = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';

/** Một ô bảng: chữ (xuống dòng giữ nguyên), in đậm/căn giữa tùy chọn. */
function cellXml(value, { w, center = false, bold = false, shade = false }) {
  const runs = String(value ?? '').split(/\r?\n/).map((line, i) => (i ? '<w:br/>' : '') + `<w:t xml:space="preserve">${xmlEscape(line)}</w:t>`).join('');
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shade ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : ''}<w:vAlign w:val="center"/></w:tcPr>`
    + `<w:p><w:pPr><w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="0"/>${center ? '<w:jc w:val="center"/>' : ''}</w:pPr>`
    + `<w:r><w:rPr>${TNR}${bold ? '<w:b/>' : ''}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>${runs}</w:r></w:p></w:tc>`;
}

/** Bảng chi tiết thiết bị cần thí nghiệm (rows: [{ name, position, note }]); rỗng -> ''. */
function testEquipmentXml(rows) {
  if (!rows?.length) return '';
  const border = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join('');
  const head = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${EQUIP_COLS.map(c => cellXml(c.title, { w: c.w, center: true, bold: true, shade: true })).join('')}</w:tr>`;
  const body = rows.map((r, i) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${[i + 1, r.name, r.position, r.note]
    .map((v, k) => cellXml(v, { w: EQUIP_COLS[k].w, center: EQUIP_COLS[k].center })).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${EQUIP_COLS.reduce((s, c) => s + c.w, 0)}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${border}</w:tblBorders>`
    + '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>'
    + `<w:tblGrid>${EQUIP_COLS.map(c => `<w:gridCol w:w="${c.w}"/>`).join('')}</w:tblGrid>${head}${body}</w:tbl>`
    + '<w:p><w:pPr><w:spacing w:before="0" w:after="60"/></w:pPr></w:p>';
}

const paragraphText = (p) => (p.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('');

/**
 * Chèn bảng ngay sau đoạn "Kiểm tra:" đầu tiên của mục "Phương án thực hiện" (mẫu không có thẻ {@testEquipmentXml}).
 * Không thấy đoạn đó thì để nguyên văn bản.
 */
function insertAfterCheckLine(xml, tableXml) {
  let inSection = false;
  for (const m of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const txt = paragraphText(m[0]).replace(/\s+/g, ' ').trim();
    if (/Phương án thực hiện/i.test(txt)) { inSection = true; continue; }
    if (inSection && /^-?\s*Kiểm tra\s*:?$/i.test(txt)) {
      const at = m.index + m[0].length;
      return xml.slice(0, at) + tableXml + xml.slice(at);
    }
  }
  return xml;
}

/**
 * plan: { docNumber, data }; drawings: [{ label, buffer }] ảnh các sơ đồ trạm đã chọn (có thể rỗng).
 * Mỗi sơ đồ một trang, có tên sơ đồ phía trên (trừ tên mặc định "Sơ đồ trạm").
 * Bảng thiết bị cần thí nghiệm (data.testEquipment): tại thẻ {@testEquipmentXml} nếu mẫu có, không thì sau dòng "Kiểm tra:".
 */
function renderPlanDocx(plan, drawings = [], templatePath = TEMPLATE_PATH) {
  const zip = new PizZip(loadTemplate(templatePath));
  const hasEquipTag = /testEquipmentXml/.test(zip.file('word/document.xml')?.asText() || '');
  const equipXml = testEquipmentXml(plan?.data?.testEquipment);
  const images = drawings
    .map((d, i) => ({ ...d, info: d?.buffer ? imageInfo(d.buffer) : null, part: { relId: `rIdDkctStationDrawing${i + 1}`, name: `dkct_station_drawing_${i + 1}`, docPrId: 9201 + i } }))
    .filter(d => d.info);
  const drawingXml = images.map((d, i) => (i ? PAGE_BREAK : '')
    + (d.label && d.label !== DEFAULT_DRAWING_LABEL ? caption(d.label) : '')
    + imageParagraphXml(fitImage(d.info.width, d.info.height, MAX_CX, MAX_CY), d.info.type, d.part)).join('');
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
  doc.render({ ...toPlanView(plan), drawingXml: drawingXml || NO_DRAWING, testEquipmentXml: equipXml || '<w:p/>' });
  const out = doc.getZip();
  if (equipXml && !hasEquipTag) out.file('word/document.xml', insertAfterCheckLine(out.file('word/document.xml').asText(), equipXml));
  for (const d of images) addImagePart(out, d.buffer, d.info.type, d.part);
  return out.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { renderPlanDocx, testEquipmentXml, insertAfterCheckLine, TEMPLATE_PATH };
