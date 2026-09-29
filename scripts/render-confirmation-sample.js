// Xuất Giấy xác nhận mẫu để xem bố cục: node scripts/render-confirmation-sample.js [đường_dẫn_ra.docx]
const fs = require('node:fs');
const path = require('node:path');
const { CONFIRMATION } = require('../tests/fixtures/sampleConfirmation');
const { normalizeConfirmation } = require('../server/services/confirmation');
const { renderConfirmationDocx } = require('../server/services/confirmationRender');

const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'tests', '.tmp', 'confirmation-sample.docx'));
const { data } = normalizeConfirmation(CONFIRMATION, { substations: new Map() });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, renderConfirmationDocx({ docNumber: '5/GXN-TNLĐ', data }));
console.log('Đã xuất', out);
