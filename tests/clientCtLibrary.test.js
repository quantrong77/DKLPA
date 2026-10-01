const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../client/lib/ctLibrary.js');

test('patternPoints: điền nhanh 6 dòng theo khối hàng kẹp và nhãn hai đầu CT có đấu dây', async () => {
  const { patternPoints } = await load();
  assert.deepEqual(patternPoints({ coreNo: 2, terminalBlock: 'X42' }, 'S1', 'S4'), [
    { terminal: 'X42-1', ctTerminal: '2S1' }, { terminal: 'X42-4', ctTerminal: '2S4' },
    { terminal: 'X42-2', ctTerminal: '2S1' }, { terminal: 'X42-5', ctTerminal: '2S4' },
    { terminal: 'X42-3', ctTerminal: '2S1' }, { terminal: 'X42-6', ctTerminal: '2S4' }
  ]);
  // chưa có số core/khối kẹp thì không bịa: để trống phần không suy ra được
  assert.deepEqual(patternPoints({ coreNo: null, terminalBlock: '' }, 'S1', 'S2')[0], { terminal: '', ctTerminal: '' });
});

test('parseTitleBlock: lấy tủ, số trang, số bản vẽ, ngăn từ lớp chữ khung tên PDF; thiếu thì để trống', async () => {
  const { parseTitleBlock } = await load();
  const text = 'TRẠM BIẾN ÁP 220kV PHAN RÍ NGĂN XUẤT TUYẾN 272 220PHANRI/12.6.2026/D02-272 1 2 3 4 5 6 7 8 =D02+MK202 Q1-3 MẠCH DÒNG Trang số: 115/147';
  assert.deepEqual(parseTitleBlock(text), {
    panel: '=D02+MK202', pageLabel: '115/147', drawingNumber: '220PHANRI/12.6.2026/D02-272', bay: '272', sheet: 'Q1-3'
  });
  assert.deepEqual(parseTitleBlock(''), { panel: '', pageLabel: '', drawingNumber: '', bay: '', sheet: '' });
  assert.equal(parseTitleBlock('=D02+CT abc =D02+MK202').panel, '=D02+MK202', 'ưu tiên tủ trung gian MK');
});

test('drawingRefFor: "<tủ>/<số trang>"', async () => {
  const { drawingRefFor } = await load();
  assert.equal(drawingRefFor('=D02+MK202', '115/147'), '=D02+MK202/115');
  assert.equal(drawingRefFor('D02+MK202', ''), '');
});

test('cropStyle: ảnh trang phóng sao cho vùng core lấp đầy khung', async () => {
  const { cropStyle } = await load();
  const s = cropStyle({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 1000, 800);
  assert.equal(s.box.aspectRatio, '500 / 200');
  assert.deepEqual(s.img, { width: '200%', left: '-50%', top: '-200%' });
});

test('blockFromLibrary: chụp TI vào phương án, mặc định in 4 core (ít hơn nếu TI ít core)', async () => {
  const { blockFromLibrary } = await load();
  const core = (n) => ({ id: `C${n}`, coreNo: n, terminalBlock: `X4${n}`, drawingRef: '', pageId: 'P1', region: null, points: [] });
  const ct = { id: 'TI-1', name: 'TI 272', panel: '=D02+MK202', status: 'VERIFIED', revision: 2, updatedAt: 't', cores: [1, 2, 3, 4, 5].map(core) };
  const b = blockFromLibrary(ct);
  assert.equal(b.ctId, 'TI-1');
  assert.equal(b.coresShown, 4);
  assert.equal(b.cores.length, 5);
  assert.equal(b.cores[0].coreId, 'C1');
  assert.equal(blockFromLibrary({ ...ct, cores: [core(1), core(2)] }).coresShown, 2);
  assert.equal(blockFromLibrary(ct, 5).coresShown, 5, 'giữ số core đang in khi cập nhật theo thư viện');
});

test('libraryChanges: so bản chụp trong phương án với thư viện hiện tại', async () => {
  const { blockFromLibrary, libraryChanges } = await load();
  const pts = (ct2) => [1, 4, 2, 5, 3, 6].map((t, i) => ({ terminal: `X41-${t}`, ctTerminal: `1${i % 2 ? ct2 : 'S1'}` }));
  const ct = (ct2, revision = 1) => ({ id: 'TI-1', name: 'TI 272', panel: '=D02+MK202', status: 'VERIFIED', revision, updatedAt: 'x',
    cores: [{ id: 'C1', coreNo: 1, terminalBlock: 'X41', drawingRef: '', pageId: null, region: null, points: pts(ct2) }] });
  const snap = blockFromLibrary(ct('S2'));
  assert.deepEqual(libraryChanges(snap, ct('S2')), []);
  const changes = libraryChanges(snap, ct('S4', 2));
  assert.equal(changes.length, 3);
  assert.match(changes[0], /Core 1 L1: 1S2 → 1S4/);
});

test('Đầu phía TI: danh sách chọn sẵn kS1-kS2 … kS2-kS5; gõ tay nhiều kiểu đều đọc được; sai thì null', async () => {
  const { CT_SIDE_PRESETS, parseSide, sideLabel } = await load();
  assert.deepEqual(CT_SIDE_PRESETS, ['S1-S2', 'S1-S3', 'S1-S4', 'S1-S5', 'S2-S3', 'S2-S4', 'S2-S5']);
  assert.deepEqual(parseSide('kS1-kS4'), ['S1', 'S4']);
  assert.deepEqual(parseSide(' s2 / s5 '), ['S2', 'S5']);
  assert.deepEqual(parseSide('S1S4'), ['S1', 'S4']);
  assert.deepEqual(parseSide('kS3-kS4'), ['S3', 'S4'], 'gõ cặp ngoài danh sách được');
  assert.equal(parseSide('S1'), null);
  assert.equal(parseSide('S1-S1'), null);
  assert.equal(sideLabel('S1-S4'), 'kS1-kS4');
});
