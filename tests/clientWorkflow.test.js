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
  assert.deepEqual(steps.map(s => s.label), ['Lịch / Công việc', 'Khảo sát', 'Phương án', 'Giấy ĐKCT', 'Giấy xác nhận']);
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

test('công việc không có lịch cắt điện: là bước 1 của luồng, nhãn và mô tả riêng', async () => {
  const { workflowSteps, selectionTitle, linkedIds, stepOfType, listOfType, docLabel } = await load();
  const chain = {
    outages: [],
    works: [{ id: 'W1', startTime: '2026-10-12T08:00', content: 'Kiểm tra tủ điều khiển ngăn 271' }],
    surveys: [{ id: 'S1', surveyTime: '2026-10-06T08:00' }],
    plans: [],
    registrations: [],
    confirmations: []
  };
  assert.equal(stepOfType('work').type, 'outage');
  assert.equal(listOfType('work'), 'works');
  assert.equal(listOfType('plan'), 'plans');
  assert.equal(docLabel('work', chain.works[0]), 'CV 12/10/2026');
  const steps = workflowSteps(chain, { type: 'work', id: 'W1' });
  assert.deepEqual(steps.map(s => s.state), ['selected', 'done', 'next', 'todo', 'todo']);
  assert.deepEqual(steps[0].docs.map(d => [d.type, d.label]), [['work', 'CV 12/10/2026']]);
  assert.equal(workflowSteps(chain, { type: 'survey', id: 'S1' })[0].state, 'done');
  assert.equal(selectionTitle('work', chain.works[0]), 'Công việc 12/10/2026 · Kiểm tra tủ điều khiển ngăn 271');
  assert.deepEqual([...linkedIds(chain)].sort(), ['S1', 'W1']);
});
