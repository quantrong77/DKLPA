const test = require('node:test');
const assert = require('node:assert/strict');
const { PLAN } = require('./fixtures/samplePlan');

const load = () => import('../client/lib/confirmation.js');
const EMPTY = { station: { substationId: null, name: '' }, bays: '', workObject: '', equipment: '', items: [{ text: '', result: 'đạt' }] };

test('confirmationFromPlan: mỗi nhóm thiết bị còn hạng mục thành một mục "đạt"; điền trạm, ngăn lộ khi còn trống', async () => {
  const { confirmationFromPlan } = await load();
  const plan = { id: 'PA-1', data: { ...PLAN, testGroups: [
    { label: 'MÁY BIẾN ÁP AT2', items: [{ name: 'Đo điện trở cách điện', checked: true }] },
    { label: 'MÁY CẮT 532', items: [{ name: 'x', checked: false }] },
    { label: 'Chống sét van 232', items: [{ name: 'y' }] }
  ] } };
  const f = confirmationFromPlan(EMPTY, plan);
  assert.equal(f.planId, 'PA-1');
  assert.deepEqual(f.items, [
    { text: 'Thí nghiệm định kỳ máy biến áp AT2', result: 'đạt' },
    { text: 'Thí nghiệm định kỳ Chống sét van 232', result: 'đạt' }
  ]);
  assert.equal(f.station.name, 'Trạm biến áp 500kV Vĩnh Tân');
  assert.equal(f.bays, PLAN.bays);
  assert.equal(f.equipment, PLAN.equipmentText);

  const kept = confirmationFromPlan({ ...EMPTY, station: { substationId: 'T', name: 'TBA khác' }, bays: 'MC 212' }, { id: 'PA-2', data: { ...PLAN, testGroups: [] } });
  assert.deepEqual([kept.station.name, kept.bays], ['TBA khác', 'MC 212'], 'không ghi đè ô đã có');
  assert.deepEqual(kept.items, [{ text: `Thí nghiệm định kỳ các thiết bị nhất thứ ngăn lộ ${PLAN.bays}`, result: 'đạt' }]);
});
