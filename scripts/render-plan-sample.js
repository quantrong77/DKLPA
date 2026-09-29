// Xuất Phương án mẫu để xem bố cục: node scripts/render-plan-sample.js [ảnh_sơ_đồ_1.png[,ảnh_sơ_đồ_2.jpg…]] [đường_dẫn_ra.docx]
const fs = require('node:fs');
const path = require('node:path');
const { PLAN } = require('../tests/fixtures/samplePlan');
const { renderPlanDocx } = require('../server/services/planRender');

// nhiều ảnh (phân cách bằng dấu phẩy) = nhiều sơ đồ, vd TBA 500kV phía 500kV và phía 220kV
const files = process.argv[2] ? process.argv[2].split(',') : [];
const drawings = files.map((f, i) => ({ label: files.length > 1 ? ['Phía 500kV', 'Phía 220kV'][i] || `Sơ đồ ${i + 1}` : 'Sơ đồ trạm', buffer: fs.readFileSync(f) }));
const out = path.resolve(process.argv[3] || path.join(__dirname, '..', 'tests', '.tmp', 'plan-sample.docx'));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, renderPlanDocx({ docNumber: '12/PA-TNLĐ.Nhatthu', data: PLAN }, drawings));
console.log('Đã xuất', out);
