const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../client/lib/workflow.js');

const CHAIN = {
  outages: [{ id: 'O1', regStart: '2026-10-05T07:00', content: 'TNĐK ngăn 232' }],
  surveys: [{ id: 'S1', surveyTime: '2026-09-28T08:00', workContent: 'Khảo sát ngăn 232' }],
  plans: [{ id: 'P1', docNumber: '12/PA-TNLĐ', workTitle: 'Thí nghiệm định kỳ ngăn 232' }],
  registrations: [],
  confirmations: []
};

test('workflowSteps: chưa chọn hồ sơ thì mọi bước ở trạng thái idle', async () => {
  const { workflowSteps } = await load();
  const steps = workflowSteps(null, null);
  assert.deepEqual(steps.map(s => s.label), ['Lịch cắt điện', 'Khảo sát', 'Phương án', 'Giấy ĐKCT', 'Giấy xác nhận']);
  assert.ok(steps.every(s => s.state === 'idle' && s.docs.length === 0));
});

test('workflowSteps: bước của hồ sơ đang chọn, bước đã có, bước tiếp theo, bước chưa có', async () => {
  const { workflowSteps, doneCount } = await load();
  const steps = workflowSteps(CHAIN, { type: 'plan', id: 'P1' });
  assert.deepEqual(steps.map(s => s.state), ['done', 'done', 'selected', 'next', 'todo']);
  assert.deepEqual(steps[2].docs.map(d => d.label), ['12/PA-TNLĐ']);
  assert.deepEqual(steps[0].docs.map(d => d.label), ['5/10/2026']);
  assert.deepEqual(steps[1].docs.map(d => d.label), ['BB 28/9/2026']);
  assert.equal(doneCount(steps), 3);
  // chọn lịch chưa có hồ sơ nào: bước tiếp theo là khảo sát
  const fresh = workflowSteps({ outages: CHAIN.outages }, { type: 'outage', id: 'O1' });
  assert.deepEqual(fresh.map(s => s.state), ['selected', 'next', 'todo', 'todo', 'todo']);
});

test('selectionTitle, linkedIds: mô tả hồ sơ đang theo dõi và tập hồ sơ cùng luồng', async () => {
  const { selectionTitle, linkedIds } = await load();
  assert.equal(selectionTitle('plan', CHAIN.plans[0]), 'Phương án 12/PA-TNLĐ · Thí nghiệm định kỳ ngăn 232');
  assert.equal(selectionTitle('outage', CHAIN.outages[0]), 'Lịch cắt điện 5/10/2026 · TNĐK ngăn 232');
  assert.deepEqual([...linkedIds(CHAIN)].sort(), ['O1', 'P1', 'S1']);
  assert.equal(linkedIds(null).size, 0);
});
