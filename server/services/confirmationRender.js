/**
 * Điền Giấy xác nhận đủ điều kiện đóng điện vào mẫu Word templates/template_gxn.docx (sinh bằng scripts/tag_gxn.py).
 */
const fs = require('node:fs');
const path = require('node:path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'templates', 'template_gxn.docx');
let templateBinary = null;

const upper = (s) => String(s || '').trim().toLocaleUpperCase('vi');
const ymd = (iso) => /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');

/** "2026-09-27" -> "27/9/2026" (như mẫu). */
function shortDate(iso) {
  const m = ymd(iso);
  return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : '…/…/……';
}

/** "Khánh Hòa, ngày 27 tháng 9 năm 2026" */
function placeDate(place, iso) {
  const m = ymd(iso);
  const date = m ? `ngày ${m[3]} tháng ${m[2]} năm ${m[1]}` : 'ngày … tháng … năm ……';
  return `${String(place || '').trim() || '……'}, ${date}`;
}

function toConfirmationView({ docNumber, data }) {
  const h = data.header || {};
  return {
    docNumber: docNumber || '……',
    companyUpper: upper(h.companyName || 'Công ty Truyền tải điện 3'),
    unitUpper: upper(h.unitName),
    stationName: data.station?.name || '',
    bays: data.bays || '',
    workDate: shortDate(data.workDate),
    teamText: [h.teamName, h.unitName].filter(Boolean).join(' – '),
    workObject: data.workObject || '',
    items: (data.items || []).map(it => ({ text: it.text, result: it.result || 'đạt' })),
    equipment: data.equipment || '',
    note: data.note || '',
    placeDate: placeDate(h.place, h.date),
    teamName: h.teamName || '',
    signer: data.signer || ''
  };
}

function loadTemplate(templatePath) {
  if (templatePath !== TEMPLATE_PATH) return fs.readFileSync(templatePath, 'binary');
  templateBinary = templateBinary || fs.readFileSync(TEMPLATE_PATH, 'binary');
  return templateBinary;
}

/** confirmation: { docNumber, data } -> Buffer DOCX. */
function renderConfirmationDocx(confirmation, templatePath = TEMPLATE_PATH) {
  const doc = new Docxtemplater(new PizZip(loadTemplate(templatePath)), { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
  doc.render(toConfirmationView(confirmation));
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { renderConfirmationDocx, toConfirmationView, shortDate, placeDate, TEMPLATE_PATH };
