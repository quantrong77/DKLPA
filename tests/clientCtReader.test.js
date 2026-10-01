const test = require('node:test');
const assert = require('node:assert/strict');

const vector = () => import('../client/lib/ctVector.js');
const glyphs = () => import('../client/lib/ctGlyphs.js');
const font = () => import('../client/lib/ctFont.js');

const OPS = { save: 10, restore: 11, transform: 12, fill: 22, eoFill: 23, setGState: 1, setFillRGBColor: 59, setFillGray: 57, constructPath: 91 };
// hình chữ nhật (moveTo, lineTo ×3, closePath) theo mã DrawOPS của pdf.js 5
const rect = (x, y, w, h) => [0, x, y, 1, x + w, y, 1, x + w, y + h, 1, x, y + h, 4];

test('filledShapes: lấy hình tô kèm màu, độ trong suốt (watermark) và ma trận; bỏ đường không tô', async () => {
  const { filledShapes } = await vector();
  const opList = {
    fnArray: [OPS.save, OPS.setGState, OPS.constructPath, OPS.restore, OPS.setFillRGBColor, OPS.transform, OPS.constructPath, OPS.constructPath],
    argsArray: [null, [[['ca', 0.2]]], [OPS.fill, [rect(0, 0, 1, 1)]], null, ['#000000'], [1, 0, 0, 1, 10, 5], [OPS.fill, [rect(0, 0, 2, 1)]], [28, [rect(0, 0, 3, 3)]]]
  };
  const shapes = filledShapes(opList, OPS, [1, 0, 0, 1, 0, 0]);
  assert.equal(shapes.length, 2, 'endPath (28) không tô thì bỏ');
  assert.equal(shapes[0].alpha, 0.2, 'watermark trong suốt');
  assert.equal(shapes[1].alpha, 1, 'restore trả lại độ trong suốt');
  assert.deepEqual(shapes[1].pts[0], [10, 5], 'áp ma trận transform');
  assert.equal(shapes[1].fill, '#000000');
});

test('toStroke / centerSegments: nét thẳng ra một đoạn; nét gấp khúc (dây vẽ thành một hình) tách thành các đoạn đường tâm', async () => {
  const { toStroke, centerSegments } = await vector();
  const pen = 0.75;
  const line = toStroke({ pts: [[0, 0], [10, 0], [10, pen], [0, pen]] }, pen);
  assert.equal(line.straight, true);
  assert.ok(Math.abs(line.L - 10) < 1e-9);
  // dây hình chữ L: đứng x∈[0, 0.75] từ y 0 → 20.75, ngang y∈[20, 20.75] tới x 20
  const ell = toStroke({ pts: [[0, 0], [pen, 0], [pen, 20], [20, 20], [20, 20 + pen], [0, 20 + pen]] }, pen);
  assert.equal(ell.straight, false);
  const segs = centerSegments(ell, pen).map(([a, b]) => [a, b].map(p => p.map(v => Math.round(v * 100) / 100)));
  assert.equal(segs.length, 2);
  const vertical = segs.find(([a, b]) => a[0] === b[0]);
  const horizontal = segs.find(([a, b]) => a[1] === b[1]);
  assert.equal(vertical[0][0], 0.38, 'đường tâm nét đứng');
  assert.equal(horizontal[0][1], 20.38, 'đường tâm nét ngang');
  // nét cong nhỏ (cuộn dây, vòng hàng kẹp) không có cạnh dài: không phải dây
  const ring = toStroke({ pts: Array.from({ length: 24 }, (_, k) => [Math.cos(k / 24 * 2 * Math.PI), Math.sin(k / 24 * 2 * Math.PI)]) }, pen);
  assert.deepEqual(centerSegments(ring, pen), []);
});

test('matchChar: so mẫu font CAD (lệch nhẹ vẫn nhận); hình lạ không nhận; ký tự một nét theo góc', async () => {
  const { matchChar } = await glyphs();
  const { CT_FONT } = await font();
  for (const ch of ['S', 'X', '4', '1', 'C']) {
    const g = CT_FONT.find(x => x.ch === ch);
    const shifted = g.pts.map(([u, v]) => [u + 0.01, v - 0.01]);
    assert.equal(matchChar({ pts: shifted }, CT_FONT).ch, ch, `nhận ${ch}`);
  }
  const blob = Array.from({ length: 40 }, (_, k) => [(k % 7) * 0.13, Math.floor(k / 7) * 0.2]);
  assert.equal(matchChar({ pts: blob }, CT_FONT).ch, null, 'không đoán bừa');
  assert.equal(matchChar({ line: { du: 0.4, dv: 0 } }, CT_FONT).ch, '-');
  assert.equal(matchChar({ line: { du: 0, dv: 0.9 } }, CT_FONT).ch, '|', 'nét đứng đơn (nét đứt khung) không thành số 1');
  assert.equal(matchChar({ line: { du: 0.6, dv: -0.8 } }, CT_FONT).ch, '/');
  assert.equal(matchChar({ line: { du: 0.02, dv: 0.03 } }, CT_FONT).ch, '.');
});

test('font CAD: đủ ký tự cần cho nhãn mạch dòng (CORE, -Xnn, nSk, số hàng kẹp)', async () => {
  const { CT_FONT } = await font();
  const chars = new Set(CT_FONT.map(g => g.ch));
  for (const ch of '0123456789CORESXTAB-') assert.ok(chars.has(ch), `thiếu mẫu ${ch}`);
});
