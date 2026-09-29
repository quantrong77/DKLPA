// Xuất BBKSHT mẫu để xem bố cục: node scripts/render-survey-sample.js [ảnh_sơ_đồ.png|jpg] [đường_dẫn_ra.docx]
const fs = require('node:fs');
const path = require('node:path');
const { SURVEY } = require('../tests/fixtures/sampleSurvey');
const { renderSurveyDocx } = require('../server/services/surveyRender');

const image = process.argv[2] ? { buffer: fs.readFileSync(process.argv[2]) } : null;
const out = path.resolve(process.argv[3] || path.join(__dirname, '..', 'tests', '.tmp', 'survey-sample.docx'));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, renderSurveyDocx({ data: SURVEY }, image));
console.log('Đã xuất', out);
