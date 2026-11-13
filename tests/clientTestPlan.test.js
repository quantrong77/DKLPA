const test = require('node:test');
const assert = require('node:assert/strict');
const DEVICES = require('../server/seeds/tests1901.json');

test('kế hoạch thí nghiệm -> phương án: Bảng 1 theo chu kỳ dài nhất, bảng thiết bị cần thí nghiệm, không thêm trùng', async () => {
  const { fromTestPlan, planBayKeys, mainCycle, itemNote } = await import('../client/lib/testPlan.js');
  assert.deepEqual([...planBayKeys('530, 532; MBA AT2 và MC 231')], ['530', '532', 'AT2', '231']);
  assert.equal(mainCycle(['y3', 'y6']), 'y6');
  assert.equal(mainCycle(['tc']), null);
  const items = [
    { id: 'k1', bay: 'AT1', deviceName: 'MBA AT1', deviceKey: 'MBA', cycles: ['y3'], inspection: false, note: '' },
    { id: 'k2', bay: '231', deviceName: 'MC 231', deviceKey: 'MC_SF6', cycles: ['y6'], inspection: true, note: 'Thay dầu' },
    { id: 'k3', bay: 'C11', deviceName: 'TU C11', deviceKey: 'TU_TU', cycles: ['tc'], inspection: false, note: '' },
    { id: 'k4', bay: 'AT1', deviceName: 'Rơle công nghệ', deviceKey: '', cycles: ['y3'], inspection: false, note: '' }
  ];
  assert.equal(itemNote(items[1]), '6 năm; Kiểm định AT; Thay dầu');
  const r = fromTestPlan({ testGroups: [], testEquipment: [] }, items, DEVICES);
  assert.deepEqual([r.groups, r.rows], [2, 4], 'tăng cường, rơle: chỉ vào bảng thiết bị');
  assert.deepEqual(r.form.testGroups.map(g => [g.deviceKey, g.cycle, g.label]), [['MBA', 'y3', 'MBA AT1'], ['MC_SF6', 'y6', 'MC 231']]);
  assert.ok(r.form.testGroups[1].items.length > 5, 'hạng mục QĐ 1901 của máy cắt SF6, 6 năm');
  assert.deepEqual(r.form.testEquipment.map(x => [x.name, x.position, x.note]), [
    ['Máy biến áp', 'MBA AT1', '3 năm'], ['Máy cắt SF6', 'MC 231', '6 năm; Kiểm định AT; Thay dầu'],
    ['Biến điện áp (kiểu tụ, kín cách điện dầu)', 'TU C11', 'Tăng cường'], ['Rơle công nghệ', 'AT1', '3 năm']
  ]);
  assert.deepEqual(r.form.testPlanItemIds, ['k1', 'k2', 'k3', 'k4']);
  const again = fromTestPlan(r.form, items, DEVICES);
  assert.deepEqual([again.groups, again.rows, again.form.testPlanItemIds.length], [0, 0, 4], 'thêm lại: không trùng');
});
