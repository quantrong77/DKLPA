const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ROWS, normalizeTerminal, normalizeCtTerminal, normalizeCt, validateCt, diffCores, pointStatus
} = require('../server/services/ctLibrary');

/** Core đủ 6 điểm theo quy ước Xk-1/-4, -2/-5, -3/-6 và kS1/kS2 (dữ liệu thử, không lấy từ bản vẽ thật). */
const fullCore = (no, block = `X4${no}`, ct = ['S1', 'S2']) => ({
  coreNo: no, terminalBlock: block, drawingRef: `=D02+MK202/11${no}`,
  points: ROWS.map((r, i) => ({ terminal: `${block}-${r.terminal}`, ctTerminal: `${no}${ct[i % 2]}` }))
});
const CT = { name: 'TI 272', bay: '272', panel: '=D02+MK202', drawingNumber: '220PR/D02-272', cores: [fullCore(1), fullCore(2)] };

test('ROWS: 6 dòng mỗi core như mẫu — L1 (-1, -4), L2 (-2, -5), L3 (-3, -6)', () => {
  assert.deepEqual(ROWS.map(r => `${r.phase}:${r.terminal}`), ['L1:1', 'L1:4', 'L2:2', 'L2:5', 'L3:3', 'L3:6']);
});

test('normalizeTerminal / normalizeCtTerminal: bỏ khoảng trắng, viết hoa, dấu nối chuẩn; rỗng -> null', () => {
  assert.equal(normalizeTerminal(' x41 - 1 '), 'X41-1');
  assert.equal(normalizeTerminal('XA1:4'), 'XA1-4');
  assert.equal(normalizeTerminal('X41.2'), 'X41-2');
  assert.equal(normalizeTerminal('  '), null);
  assert.equal(normalizeCtTerminal(' 1s4 '), '1S4');
  assert.equal(normalizeCtTerminal(''), null);
});

test('normalizeCt: bắt buộc tên TI; mỗi core đúng 6 điểm, pha theo dòng; ô trống là null (không tự điền)', () => {
  const { data, errors } = normalizeCt({ ...CT, cores: [{ coreNo: '1', terminalBlock: ' x41 ', points: [{ terminal: 'x41-1', ctTerminal: '1s1' }] }] });
  assert.deepEqual(errors, []);
  const core = data.cores[0];
  assert.equal(core.coreNo, 1);
  assert.equal(core.terminalBlock, 'X41');
  assert.equal(core.points.length, 6);
  assert.deepEqual(core.points[0], { seq: 1, phase: 'L1', terminal: 'X41-1', ctTerminal: '1S1' });
  assert.deepEqual(core.points[5], { seq: 6, phase: 'L3', terminal: null, ctTerminal: null });
  assert.deepEqual(normalizeCt({ cores: [] }).errors.map(e => e.field), ['name']);
  assert.equal(normalizeCt({ ...CT, cores: Array.from({ length: 21 }, (_, i) => fullCore(i + 1)) }).errors[0].field, 'cores');
});

test('normalizeCt: vùng nguồn chuẩn hóa về 0..1, vùng hỏng thì bỏ', () => {
  const { data } = normalizeCt({ ...CT, cores: [
    { ...fullCore(1), pageId: 'P1', region: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } },
    { ...fullCore(2), pageId: 'P1', region: { x: 0.9, y: 0.2, w: 0.5, h: 0.4 } },
    { ...fullCore(3), pageId: 'P1', region: { x: 'a' } }
  ] });
  assert.deepEqual(data.cores[0].region, { x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  assert.deepEqual(data.cores[1].region, { x: 0.9, y: 0.2, w: 0.1, h: 0.4 }, 'cắt phần tràn khỏi trang');
  assert.equal(data.cores[2].region, null);
});

test('validateCt: đủ dữ liệu thì không có lỗi; chỉ cảnh báo khi core chưa có vùng nguồn', () => {
  const issues = validateCt(normalizeCt(CT).data);
  assert.deepEqual(issues.filter(i => i.level === 'error'), []);
  assert.ok(issues.some(i => i.code === 'NO_SOURCE' && i.level === 'warning'));
});

test('validateCt: ô trống = CHƯA ĐỦ DỮ LIỆU; thiếu số core, trùng core, trùng hàng kẹp là lỗi', () => {
  const c1 = fullCore(1);
  c1.points[3].ctTerminal = '';
  const dupTerminal = fullCore(2);
  dupTerminal.points[0].terminal = 'X41-1';
  const { data } = normalizeCt({ ...CT, cores: [c1, dupTerminal, { ...fullCore(2), coreNo: '' }, fullCore(2)] });
  const codes = validateCt(data).filter(i => i.level === 'error').map(i => i.code);
  assert.ok(codes.includes('INSUFFICIENT_DATA'));
  assert.ok(codes.includes('DUPLICATE_TERMINAL'));
  assert.ok(codes.includes('MISSING_CORE_NO'));
  assert.ok(codes.includes('DUPLICATE_CORE'));
  const insufficient = validateCt(data).find(i => i.code === 'INSUFFICIENT_DATA');
  assert.deepEqual([insufficient.core, insufficient.seq], [0, 4]);
  assert.match(insufficient.message, /CHƯA ĐỦ DỮ LIỆU/);
});

test('validateCt: đầu CT khác số core, hàng kẹp khác khối là cảnh báo (bản vẽ có thể ghi khác, kỹ sư quyết định)', () => {
  const c = fullCore(3);
  c.points[0].ctTerminal = '1S1';
  c.points[1].terminal = 'X99-4';
  const issues = validateCt(normalizeCt({ ...CT, cores: [c] }).data);
  assert.ok(issues.some(i => i.code === 'CT_CORE_MISMATCH' && i.level === 'warning'));
  assert.ok(issues.some(i => i.code === 'TERMINAL_BLOCK_MISMATCH' && i.level === 'warning'));
});

test('pointStatus: ô trống -> INSUFFICIENT_DATA; TI đã xác nhận -> VERIFIED; còn lại cần kiểm tra', () => {
  assert.equal(pointStatus({ terminal: 'X41-1', ctTerminal: null }, 'VERIFIED'), 'INSUFFICIENT_DATA');
  assert.equal(pointStatus({ terminal: 'X41-1', ctTerminal: '1S1' }, 'VERIFIED'), 'VERIFIED');
  assert.equal(pointStatus({ terminal: 'X41-1', ctTerminal: '1S1' }, 'DRAFT'), 'NEEDS_REVIEW');
});

test('diffCores: liệt kê thay đổi theo core/dòng, core thêm và core bỏ', () => {
  const before = normalizeCt(CT).data.cores;
  const after = normalizeCt({ ...CT, cores: [fullCore(1, 'X41', ['S1', 'S4']), fullCore(3)] }).data.cores;
  const d = diffCores(before, after);
  assert.ok(d.some(x => x.core === 1 && x.seq === 2 && x.field === 'ctTerminal' && x.from === '1S2' && x.to === '1S4'));
  assert.ok(d.some(x => x.core === 2 && x.change === 'REMOVED'));
  assert.ok(d.some(x => x.core === 3 && x.change === 'ADDED'));
  assert.deepEqual(diffCores(before, before), []);
});
