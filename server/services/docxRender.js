/**
 * Điền dữ liệu giấy ĐKCT vào mẫu Word templates/template_dkct.docx (docxtemplater).
 * Mẫu có thẻ được sinh từ mẫu gốc bằng scripts/tag_template.py.
 */
const fs = require('node:fs');
const path = require('node:path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { toDocxView } = require('./docxView');

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'templates', 'template_dkct.docx');
let templateBinary = null;

function loadTemplate(templatePath) {
  if (templatePath !== TEMPLATE_PATH) return fs.readFileSync(templatePath, 'binary');
  templateBinary = templateBinary || fs.readFileSync(TEMPLATE_PATH, 'binary');
  return templateBinary;
}

function renderRegistrationDocx(registration, templatePath = TEMPLATE_PATH) {
  const doc = new Docxtemplater(new PizZip(loadTemplate(templatePath)), {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => ''
  });
  doc.render(toDocxView(registration));
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { renderRegistrationDocx, TEMPLATE_PATH };
