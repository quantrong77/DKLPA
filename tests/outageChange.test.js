const test = require('node:test');
const assert = require('node:assert/strict');
const { similarity, pairChanges, changeNote, queryIn, attachOutageChanges, IN_CHUNK } = require('../server/services/outageChange');

const row = (regStart, regEnd, location, content, scope = '') => ({ id: `${location}|${regStart}`, rowHash: `${location}|${regStart}|${content}`, regStart, regEnd, location, content, scope });

test('similarity: theo từ, bỏ dấu câu và hoa/thường', () => {
  assert.equal(similarity('Thí nghiệm MBA T1.', 'thí nghiệm mba t1'), 1);
  assert.equal(similarity('', ''), 1);
  assert.equal(similarity('Thay sứ MC171', 'Sửa chữa DCL 271-1'), 0);
  assert.ok(similarity('Thí nghiêm định kỳ MBA T1', 'Thí nghiệm định kỳ MBA T1') > 0.6);
});

test('pairChanges: dời lịch cùng trạm, sửa chữ cùng giờ; khác trạm / khác việc thì không ghép', () => {
  const oldA = row('2024-10-05T07:00', '2024-10-05T17:00', 'TBA Tháp Chàm', 'Thí nghiệm định kỳ ngăn 232');
  const oldB = row('2024-10-06T07:00', '2024-10-06T17:00', 'TBA Ninh Sơn', 'Thí nghiêm MBA T1');
  const oldC = row('2024-10-07T07:00', '2024-10-07T17:00', 'TBA Đa Nhim', 'Sửa chữa DCL 271-1');
  const newA = row('2024-10-09T07:00', '2024-10-09T17:00', 'TBA Tháp Chàm', 'Thí nghiệm định kỳ ngăn 232');
  const newB = row('2024-10-06T07:00', '2024-10-06T17:00', 'TBA Ninh Sơn', 'Thí nghiệm MBA T1');
  const otherStation = row('2024-10-08T07:00', '2024-10-08T17:00', 'TBA Cam Ranh', 'Sửa chữa DCL 271-1');
  const otherWork = row('2024-10-10T07:00', '2024-10-10T17:00', 'TBA Đa Nhim', 'Thay sứ MC171');
  const pairs = pairChanges([oldA, oldB, oldC], [newA, newB, otherStation, otherWork]);
  assert.deepEqual(pairs.map(p => [p.old.location, p.kind]).sort(), [['TBA Ninh Sơn', 'EDITED'], ['TBA Tháp Chàm', 'MOVED']]);
});

test('pairChanges: hai việc giống nhau cùng trạm -> mỗi dòng cũ ghép dòng mới gần ngày nhất, không ghép trùng', () => {
  const o1 = row('2024-10-05T07:00', '2024-10-05T17:00', 'TBA X', 'Thí nghiệm MC231');
  const o2 = row('2024-10-20T07:00', '2024-10-20T17:00', 'TBA X', 'Thí nghiệm MC231');
  const n1 = row('2024-10-06T07:00', '2024-10-06T17:00', 'TBA X', 'Thí nghiệm MC231');
  const n2 = row('2024-10-21T07:00', '2024-10-21T17:00', 'TBA X', 'Thí nghiệm MC231');
  const pairs = pairChanges([o1, o2], [n2, n1]);
  assert.deepEqual(pairs.map(p => [p.old.regStart, p.row.regStart]).sort(), [
    ['2024-10-05T07:00', '2024-10-06T07:00'], ['2024-10-20T07:00', '2024-10-21T07:00']
  ]);
});

test('changeNote: giờ cũ -> mới; các mục chữ đã sửa', () => {
  const o = row('2024-10-05T07:00', '2024-10-05T17:00', 'TBA X', 'Việc A', 'Cô lập 1');
  assert.equal(changeNote('MOVED', o, row('2024-10-09T08:00', '2024-10-10T16:00', 'TBA X', 'Việc A')), 'Dời lịch: 05/10 07:00–17:00 → 09/10 08:00 – 10/10 16:00');
  assert.equal(changeNote('EDITED', o, row('2024-10-05T07:00', '2024-10-05T17:00', 'TBA X', 'Việc A sửa', 'Cô lập 2')), 'Sửa nội dung, phạm vi trong lịch');
});

test('queryIn: chia IN (...) thành nhóm không quá giới hạn tham số; attachOutageChanges chỉ gắn hoãn/dời/sửa', async () => {
  const calls = [];
  const db = { async query(sql, params) { calls.push(params.length); return params.map(id => ({ id })); } };
  const values = Array.from({ length: IN_CHUNK * 2 + 5 }, (_, i) => `v${i}`);
  const out = await queryIn(db, 'SELECT id FROM t WHERE id IN ({in})', values);
  assert.equal(out.length, values.length);
  assert.deepEqual(calls, [IN_CHUNK, IN_CHUNK, 5]);

  const odb = { async query() { return [{ id: 'O1', changeKind: 'MOVED', changeNote: 'Dời lịch', changeAt: 't' }]; } };
  const rows = await attachOutageChanges(odb, [{ id: 'S1', outageId: 'O1' }, { id: 'S2', outageId: 'O2' }, { id: 'S3', outageId: null }]);
  assert.deepEqual(rows.map(r => r.outageChange?.kind ?? null), ['MOVED', null, null]);
});

test('client outageAlert / chainAlert: cảnh báo hoãn, dời, sửa (không cảnh báo phát sinh); hoãn ưu tiên', async () => {
  const { outageAlert, chainAlert } = await import('../client/lib/outageChange.js');
  assert.equal(outageAlert('NEW'), null);
  assert.equal(outageAlert(null), null);
  assert.equal(outageAlert('MOVED', 'Dời lịch: 05/10 → 09/10').note, 'Dời lịch: 05/10 → 09/10');
  assert.equal(chainAlert([]), null);
  const a = chainAlert([{ id: 'O1', changeKind: 'EDITED' }, { id: 'O2', changeKind: 'POSTPONED', changeNote: 'Không còn trong lịch mới' }, { id: 'O3', changeKind: 'NEW' }]);
  assert.deepEqual([a.kind, a.outage.id, a.note], ['POSTPONED', 'O2', 'Không còn trong lịch mới']);
});
