// Tự đọc bản vẽ mạch dòng mẫu (PDF thật). Bản vẽ không đưa vào repo: chỉ chạy khi có thư mục mẫu trên máy
// (DKCT_CT_SAMPLES, mặc định thư mục 272 Phan Rí của người phát triển) và pdfjs-dist (cài trong standalone/).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');

const DIR = process.env.DKCT_CT_SAMPLES || 'C:/Users/quant/Documents/Antigravity/ecircuit/Machdong/272phanrimachdong/272';
const PAGES = {
  '1103-220PHANRI_1262026_D02-272-118-core12.pdf': [[1, 'X41', '1S1', '1S4'], [2, 'X42', '2S1', '2S4']],
  '1103-220PHANRI_1262026_D02-272-119-core34.pdf': [[3, 'X43', '3S1', '3S4'], [4, 'X44', '4S1', '4S4']],
  // core 5: nhãn đầu cuộn đảo (5S4 nối kẹp 1–3) — phải dò dây, không suy theo vị trí
  '1103-220PHANRI_1262026_D02-272-120-core5.pdf': [[5, 'X45', '5S4', '5S1']]
};

function pdfjsPath() {
  try {
    return createRequire(path.join(__dirname, '..', 'standalone', 'package.json')).resolve('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (e) { return null; }
}
const available = fs.existsSync(DIR) && Object.keys(PAGES).every(f => fs.existsSync(path.join(DIR, f))) && pdfjsPath();

test('tự đọc bản vẽ mạch dòng mẫu 272 Phan Rí: đủ 5 core × 6 điểm, đúng nhãn trên bản vẽ', { skip: available ? false : 'không có bản vẽ mẫu trên máy này' }, async () => {
  const pdfjs = await import(pathToFileURL(pdfjsPath()).href);
  const { filledShapes } = await import('../client/lib/ctVector.js');
  const { readCtPage } = await import('../client/lib/ctReader.js');
  for (const [file, expected] of Object.entries(PAGES)) {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(DIR, file))), verbosity: 0 }).promise;
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const shapes = filledShapes(await page.getOperatorList(), pdfjs.OPS, vp.transform);
    await doc.destroy();
    const { cores, warnings } = readCtPage(shapes, { width: vp.width, height: vp.height });
    assert.deepEqual(warnings, [], file);
    assert.deepEqual(cores.map(c => c.coreNo), expected.map(e => e[0]), file);
    cores.forEach((c, i) => {
      const [, block, low, high] = expected[i];
      assert.equal(c.terminalBlock, block);
      assert.deepEqual(c.notes, [], `${block} không có cảnh báo`);
      // thứ tự dòng: L1 kẹp 1, 4; L2 kẹp 2, 5; L3 kẹp 3, 6
      assert.deepEqual(c.points, [1, 4, 2, 5, 3, 6].map(t => ({ terminal: `${block}-${t}`, ctTerminal: t <= 3 ? low : high })));
      assert.ok(c.region.w > 0.1 && c.region.h > 0.1, 'có vùng core để xem lại');
    });
  }
});
