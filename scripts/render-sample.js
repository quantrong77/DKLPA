// Xuất giấy mẫu để xem bố cục: node scripts/render-sample.js [đường_dẫn_ra.docx]
const fs = require('node:fs');
const path = require('node:path');
const { REG } = require('../tests/fixtures/sampleRegistration');
const { renderRegistrationDocx } = require('../server/services/docxRender');

const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'tests', '.tmp', 'sample.docx'));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, renderRegistrationDocx(REG));
console.log('Đã xuất', out);
