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

/**
 * plan: { docNumber, data }; drawings: [{ label, buffer }] ảnh các sơ đồ trạm đã chọn (có thể rỗng).
 * Mỗi sơ đồ một trang, có tên sơ đồ phía trên (trừ tên mặc định "Sơ đồ trạm").
 */
function renderPlanDocx(plan, drawings = [], templatePath = TEMPLATE_PATH) {
  const zip = new PizZip(loadTemplate(templatePath));
  const images = drawings
    .map((d, i) => ({ ...d, info: d?.buffer ? imageInfo(d.buffer) : null, part: { relId: `rIdDkctStationDrawing${i + 1}`, name: `dkct_station_drawing_${i + 1}`, docPrId: 9201 + i } }))
    .filter(d => d.info);
  const drawingXml = images.map((d, i) => (i ? PAGE_BREAK : '')
    + (d.label && d.label !== DEFAULT_DRAWING_LABEL ? caption(d.label) : '')
    + imageParagraphXml(fitImage(d.info.width, d.info.height, MAX_CX, MAX_CY), d.info.type, d.part)).join('');
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
  doc.render({ ...toPlanView(plan), drawingXml: drawingXml || NO_DRAWING });
  const out = doc.getZip();
  for (const d of images) addImagePart(out, d.buffer, d.info.type, d.part);
  return out.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { renderPlanDocx, TEMPLATE_PATH };
