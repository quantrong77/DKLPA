const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers/app');
const { SURVEY } = require('./fixtures/sampleSurvey');
const { PLAN } = require('./fixtures/samplePlan');
const { normalizeWork, timeTextOf, placeOf } = require('../server/services/work');

const WORK = {
  content: 'Kiểm tra, vệ sinh tủ điều khiển ngăn 271',
  stationName: 'TBA 220kV Bảo Lộc',
  location: 'Ngăn 271',
  scope: 'Không cắt điện.',
  startTime: '2026-10-12T08:00',
  endTime: '2026-10-12T16:00'
};

async function registrationInput(call, extra = {}) {
  const personnel = (await call('lead', 'GET', '/personnel')).body.items;
  const stations = (await call('lead', 'GET', '/stations')).body.items;
  const find = (name) => personnel.find(p => p.fullName === name).id;
  return {
    header: { unitName: 'Đội Sửa chữa, thí nghiệm điện 3', teamName: 'Tổ Thí nghiệm điện Lâm Đồng', place: 'Lâm Đồng', date: '2026-10-05' },
    recipient: { stationId: stations[0].id },
    workContent: { text: 'Kiểm tra tủ điều khiển ngăn 271', source: 'manual' },
    workLocation: 'Ngăn 271, TBA 220kV Bảo Lộc',
    condition: { text: 'Không cắt điện.', source: 'manual' },
    time: { start: '2026-10-12T08:00', end: '2026-10-12T16:00', source: 'manual' },
    workUnits: [{ commander: { personnelId: find('Trần Văn Hoàng') }, members: [{ personnelId: find('Kim Văn Quỳnh') }] }],
    ...extra
  };
}

test('normalizeWork: bắt buộc nội dung và trạm/địa điểm; giờ kết thúc sau giờ bắt đầu; trạm theo danh mục', () => {
  const subs = new Map([['TBA-1', { id: 'TBA-1', name: 'TBA 220kV Bảo Lộc' }]]);
  const empty = normalizeWork({}, { substations: subs });
  assert.deepEqual(empty.errors.map(e => e.field), ['content', 'stationName']);
  const bad = normalizeWork({ content: 'x', location: 'y', startTime: '2026-10-12T08:00', endTime: '2026-10-11T08:00' }, { substations: subs });
  assert.deepEqual(bad.errors.map(e => e.field), ['endTime']);
  const ok = normalizeWork({ content: ' x ', substationId: 'TBA-1', stationName: 'tên gửi lên', hacked: 1 }, { substations: subs });
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.data.stationName, 'TBA 220kV Bảo Lộc');
  assert.equal(ok.data.substationId, 'TBA-1');
  assert.equal(ok.data.hacked, undefined);
  assert.equal(timeTextOf(WORK), 'từ 08h00 ngày 12/10/2026 đến 16h00 ngày 12/10/2026.');
  assert.equal(timeTextOf({}), 'theo kế hoạch được duyệt.');
  assert.equal(placeOf(WORK), 'Ngăn 271, TBA 220kV Bảo Lộc');
});

test('công việc không có lịch cắt điện: lập/sửa/xóa theo quyền, chỉ cùng tổ xem; trạm khớp danh mục', async () => {
  const app = await startApp();
  try {
    assert.equal((await app.call('lead', 'GET', '/work-defaults')).body.draft.scope, 'Không cắt điện.');
    assert.equal((await app.call('member', 'POST', '/works', WORK)).status, 403);
    const invalid = await app.call('lead', 'POST', '/works', { content: '' });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.body.errors[0].field, 'content');

    const sub = (await app.call('lead', 'GET', '/substations')).body.items.find(s => s.name === 'TBA 220kV Bảo Lộc');
    const created = await app.call('lead', 'POST', '/works', { ...WORK, substationId: sub.id });
    assert.equal(created.status, 201);
    const work = created.body.work;
    assert.equal(work.department, 'Tổ Thí nghiệm điện Lâm Đồng');
    assert.equal(work.substationId, sub.id);
    assert.deepEqual([work.surveyCount, work.planCount, work.registrationCount], [0, 0, 0]);

    assert.equal((await app.call('member', 'GET', `/works/${work.id}`)).body.work.canEdit, false);
    assert.equal((await app.call('other', 'GET', `/works/${work.id}`)).status, 403);
    assert.equal((await app.call('other', 'GET', '/works')).body.items.length, 0);
    assert.equal((await app.call('admin', 'GET', '/works')).body.items.length, 1);
    assert.equal((await app.call('lead', 'GET', '/works?search=271')).body.items.length, 1);
    assert.equal((await app.call('lead', 'GET', '/works?search=khongco')).body.items.length, 0);
    assert.equal((await app.call('lead', 'GET', '/works?year=2026')).body.items.length, 1);
    assert.equal((await app.call('lead', 'GET', '/works?year=2020')).body.items.length, 0);

    assert.equal((await app.call('member', 'PUT', `/works/${work.id}`, WORK)).status, 403);
    const updated = await app.call('lead', 'PUT', `/works/${work.id}`, { ...WORK, content: 'Đổi nội dung' });
    assert.equal(updated.body.work.content, 'Đổi nội dung');
    assert.equal(updated.body.work.substationId, null, 'không gửi substationId thì bỏ liên kết danh mục');

    assert.equal((await app.call('member', 'DELETE', `/works/${work.id}`)).status, 403);
    assert.equal((await app.call('lead', 'DELETE', `/works/${work.id}`)).status, 200);
    assert.equal((await app.call('lead', 'GET', `/works/${work.id}`)).status, 404);
  } finally { app.close(); }
});

test('lập BBKSHT, phương án, giấy ĐKCT từ công việc: điền sẵn và gắn workId; không xóa được công việc đã có hồ sơ', async () => {
  const app = await startApp();
  try {
    const sub = (await app.call('lead', 'GET', '/substations')).body.items.find(s => s.name === 'TBA 220kV Bảo Lộc');
    const work = (await app.call('lead', 'POST', '/works', { ...WORK, substationId: sub.id })).body.work;
    assert.equal((await app.call('other', 'GET', `/works/${work.id}/survey-draft`)).status, 403);
    assert.equal((await app.call('lead', 'GET', '/works/KHONG-CO/plan-draft')).status, 404);

    const sd = (await app.call('lead', 'GET', `/works/${work.id}/survey-draft`)).body.draft;
    assert.equal(sd.workId, work.id);
    assert.equal(sd.outageId, null);
    assert.equal(sd.station.substationId, sub.id);
    assert.ok(sd.station.qlvhUnitName, 'gắn đơn vị QLVH của trạm');
    assert.equal(sd.equipment, 'Ngăn 271');
    assert.deepEqual(sd.scopeItems, ['Ngăn 271']);
    assert.equal(sd.workContent, WORK.content);
    assert.deepEqual(sd.risks, [], '"Không cắt điện." không thành biện pháp kỹ thuật');
    assert.match(sd.timeText, /^từ 08h00 ngày 12\/10\/2026/);
    assert.equal(sd.workUnitReps[0].name, 'Nguyễn Hữu Kính');

    const pd = (await app.call('lead', 'GET', `/works/${work.id}/plan-draft`)).body;
    assert.equal(pd.draft.workId, work.id);
    assert.equal(pd.draft.station.substationId, sub.id);
    assert.equal(pd.draft.equipmentText, WORK.content);
    assert.equal(pd.draft.bays, 'Ngăn 271');
    assert.deepEqual(pd.draft.time, { start: WORK.startTime, end: WORK.endTime });
    assert.deepEqual(pd.draft.isolationSteps, []);
    assert.equal(pd.numbering.preview, '1/PA-TNLĐ.Nhatthu');

    const rd = (await app.call('lead', 'GET', `/works/${work.id}/draft`)).body.draft;
    assert.equal(rd.workId, work.id);
    assert.equal(rd.outageId, null);
    assert.equal(rd.workContent.text, WORK.content);
    assert.equal(rd.workLocation, 'Ngăn 271, TBA 220kV Bảo Lộc');
    assert.equal(rd.condition.text, 'Không cắt điện.');
    assert.deepEqual(rd.time, { start: WORK.startTime, end: WORK.endTime, source: 'manual' });
    assert.ok(rd.risks.length > 0, 'thư viện rủi ro để tick');

    const survey = (await app.call('lead', 'POST', '/surveys', { ...SURVEY, workId: work.id })).body.survey;
    assert.equal(survey.workId, work.id);
    const plan = (await app.call('lead', 'POST', '/plans', { ...PLAN, workId: work.id, surveyId: survey.id })).body.plan;
    assert.equal(plan.workId, work.id);
    const reg = (await app.call('lead', 'POST', '/registrations', await registrationInput(app.call, { workId: work.id }))).body.registration;
    assert.equal(reg.workId, work.id);
    // workId không còn tồn tại: bỏ liên kết, không lỗi khóa ngoại
    assert.equal((await app.call('lead', 'POST', '/surveys', { ...SURVEY, workId: 'CV-KHONG-CO' })).body.survey.workId, null);

    const listed = (await app.call('lead', 'GET', '/works')).body.items[0];
    assert.deepEqual([listed.surveyCount, listed.planCount, listed.registrationCount], [1, 1, 1]);
    const del = await app.call('lead', 'DELETE', `/works/${work.id}`);
    assert.equal(del.status, 409);
  } finally { app.close(); }
});

test('luồng không có lịch cắt điện: công việc → KSHT → phương án → giấy ĐKCT (từ phương án) → giấy xác nhận', async () => {
  const app = await startApp();
  try {
    const work = (await app.call('lead', 'POST', '/works', WORK)).body.work;
    const survey = (await app.call('lead', 'POST', '/surveys', { ...SURVEY, workId: work.id })).body.survey;
    const plan = (await app.call('lead', 'POST', '/plans', { ...PLAN, workId: work.id, surveyId: survey.id })).body.plan;
    // giấy ĐKCT lập từ phương án: chỉ mang planId/surveyId (không workId) vẫn nối được luồng
    const reg = (await app.call('lead', 'POST', '/registrations', await registrationInput(app.call, { planId: plan.id, surveyId: survey.id }))).body.registration;
    assert.deepEqual([reg.planId, reg.surveyId, reg.workId], [plan.id, survey.id, null]);
    const { draft } = (await app.call('lead', 'GET', `/registrations/${reg.id}/confirmation-draft`)).body;
    assert.equal(draft.planId, plan.id, 'giấy xác nhận lấy phương án của giấy ĐKCT');
    const conf = (await app.call('lead', 'POST', '/confirmations', draft)).body.confirmation;
    // biên bản tổ khác gắn cùng công việc (admin): không lộ cho tổ này
    await app.call('admin', 'POST', '/surveys', { ...SURVEY, workId: work.id });

    const ids = (w) => [w.outages, w.works, w.surveys, w.plans, w.registrations, w.confirmations].map(l => l.map(x => x.id));
    const all = [[], [work.id], [survey.id], [plan.id], [reg.id], [conf.id]];
    for (const [type, id] of [['work', work.id], ['survey', survey.id], ['registration', reg.id], ['confirmation', conf.id]]) {
      const w = (await app.call('member', 'GET', `/workflow/${type}/${id}`)).body;
      assert.deepEqual(ids(w), all, `chọn ${type}`);
    }
    assert.equal((await app.call('other', 'GET', `/workflow/work/${work.id}`)).status, 403);

    // xóa phương án: giấy ĐKCT giữ lại, bỏ liên kết
    await app.call('lead', 'DELETE', `/confirmations/${conf.id}`);
    await app.call('lead', 'DELETE', `/plans/${plan.id}`);
    assert.equal((await app.call('lead', 'GET', `/registrations/${reg.id}`)).body.registration.planId, null);
  } finally { app.close(); }
});
