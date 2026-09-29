const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeRegistration,
  draftFromOutage,
  formatCard,
  personKey
} = require('../server/services/registration');

const CATALOG = new Map([
  ['P1', { id: 'P1', fullName: 'Trần Văn Hoàng', safetyLevel: '5/5', safetyCard: '058' }],
  ['P2', { id: 'P2', fullName: 'Kim Văn Quỳnh', safetyLevel: '5/5', safetyCard: '066' }],
  ['P3', { id: 'P3', fullName: 'Trần Phúc Linh', safetyLevel: '3/5', safetyCard: '' }],
  ['P4', { id: 'P4', fullName: 'Ngô Văn Quang', safetyLevel: '5/5', safetyCard: '057' }]
]);
const STATIONS = new Map([['S1', { id: 'S1', name: 'Tổ thao tác lưu động Phan Thiết', email: 'ttld.phanthiet@gmail.com' }]]);
const ctx = { personnel: CATALOG, stations: STATIONS };

function baseInput(overrides = {}) {
  return {
    recipient: { stationId: 'S1' },
    workContent: { text: 'Thay thế MC 174', source: 'manual' },
    workLocation: 'Ngăn XT174 TBA 220kV Phan Thiết',
    condition: { text: 'Cô lập MC174', source: 'manual' },
    time: { start: '2026-09-25T07:00', end: '2026-09-25T23:00', source: 'manual' },
    workUnits: [{ commander: { personnelId: 'P1' }, members: [{ personnelId: 'P2' }, { personnelId: 'P3' }] }],
    ...overrides
  };
}

test('formatCard: "5/5 _ 058", chỉ bậc khi chưa có số thẻ, rỗng khi không có gì', () => {
  assert.equal(formatCard({ safetyLevel: '5/5', safetyCard: '058' }), '5/5 _ 058');
  assert.equal(formatCard({ safetyLevel: '3/5', safetyCard: '' }), '3/5');
  assert.equal(formatCard({}), '');
});

test('normalize: chọn từ danh mục thì chụp tên/bậc/thẻ từ server, bỏ qua giá trị client gửi', () => {
  const { data, errors } = normalizeRegistration(baseInput({
    leader: { personnelId: 'P4', name: 'Tên giả', safetyLevel: '1/5' }
  }), ctx);
  assert.deepEqual(errors, []);
  assert.deepEqual(data.leader, { personnelId: 'P4', name: 'Ngô Văn Quang', safetyLevel: '5/5', safetyCard: '057' });
  assert.equal(data.workUnits[0].commander.name, 'Trần Văn Hoàng');
});

test('normalize: tự ghi (không personnelId) giữ tên và bậc người dùng nhập', () => {
  const { data, errors } = normalizeRegistration(baseInput({
    supervisors: [{ name: '  Lê Văn Giám  ', safetyLevel: '4/5' }, { name: '' }]
  }), ctx);
  assert.deepEqual(errors, []);
  assert.deepEqual(data.supervisors, [{ personnelId: null, name: 'Lê Văn Giám', safetyLevel: '4/5', safetyCard: '' }]);
});

test('normalize: LĐCV, GSATĐ, cảnh giới được để trống', () => {
  const { data, errors } = normalizeRegistration(baseInput({ leader: { name: '' }, watchmen: [] }), ctx);
  assert.deepEqual(errors, []);
  assert.equal(data.leader, null);
  assert.deepEqual(data.supervisors, []);
  assert.deepEqual(data.watchmen, []);
});

test('normalize: nơi nhận chọn từ danh mục tự điền email', () => {
  const { data } = normalizeRegistration(baseInput(), ctx);
  assert.deepEqual(data.recipient, { stationId: 'S1', name: 'Tổ thao tác lưu động Phan Thiết', email: 'ttld.phanthiet@gmail.com' });
});

test('normalize: ĐVCT đánh số thứ tự, tự đếm người, có thời gian và địa điểm riêng', () => {
  const { data } = normalizeRegistration(baseInput({
    workUnits: [
      { commander: { personnelId: 'P1' }, members: [{ personnelId: 'P2' }, { personnelId: 'P3' }], location: 'Ngăn 174', start: '2026-09-25T07:00', end: '2026-09-25T10:00' },
      { commander: { personnelId: 'P4' }, members: [{ personnelId: 'P2' }] }
    ]
  }), ctx);
  assert.deepEqual(data.workUnits.map(u => u.seq), [1, 2]);
  // như mẫu: ĐVCT1 có CHTT + 7 nhân viên ghi "07/ng" — không tính CHTT
  assert.deepEqual(data.workUnits.map(u => u.memberCount), [2, 1]);
  assert.equal(data.workUnits[0].location, 'Ngăn 174');
  assert.equal(data.workUnits[1].start, null);
  assert.equal(data.workUnitCount, 2);
});

test('normalize: một nhân viên được thuộc nhiều ĐVCT, nhưng không lặp trong cùng một ĐVCT', () => {
  const { data } = normalizeRegistration(baseInput({
    workUnits: [
      { commander: { personnelId: 'P1' }, members: [{ personnelId: 'P2' }, { personnelId: 'P2' }, { personnelId: 'P1' }] },
      { commander: { personnelId: 'P4' }, members: [{ personnelId: 'P2' }] }
    ]
  }), ctx);
  assert.deepEqual(data.workUnits[0].members.map(m => m.personnelId), ['P2']);
  assert.deepEqual(data.workUnits[1].members.map(m => m.personnelId), ['P2']);
});

test('normalize: lỗi bắt buộc — CHTT từng ĐVCT, nội dung, nơi nhận, ít nhất 1 ĐVCT, thời gian', () => {
  const { errors } = normalizeRegistration({
    recipient: { name: '' },
    workContent: { text: '' },
    time: { start: '2026-09-25T10:00', end: '2026-09-25T07:00' },
    workUnits: []
  }, ctx);
  const fields = errors.map(e => e.field);
  assert.ok(fields.includes('recipient'));
  assert.ok(fields.includes('workContent'));
  assert.ok(fields.includes('time'));
  assert.ok(fields.includes('workUnits'));

  const r2 = normalizeRegistration(baseInput({ workUnits: [{ commander: { name: '' }, members: [] }] }), ctx);
  assert.deepEqual(r2.errors.map(e => e.field), ['workUnits.0.commander']);
});

test('normalize: người chọn từ danh mục nhưng không còn tồn tại thì báo lỗi', () => {
  const { errors } = normalizeRegistration(baseInput({ leader: { personnelId: 'PX' } }), ctx);
  assert.deepEqual(errors.map(e => e.field), ['leader']);
});

test('normalize: đề cử — số thẻ tự theo, nhiệm vụ lấy theo lựa chọn', () => {
  const { data, errors } = normalizeRegistration(baseInput({
    nominees: [
      { person: { personnelId: 'P1' }, duty: 'Chỉ huy trực tiếp đơn vị công tác 1' },
      { person: { name: 'Mai Văn Giáp' }, duty: 'Lái xe chở người ĐVCT 1 (không tham gia nhóm công tác)' },
      { person: { name: '' }, duty: 'bỏ qua dòng trống' }
    ]
  }), ctx);
  assert.deepEqual(errors, []);
  assert.equal(data.nominees.length, 2);
  assert.equal(data.nominees[0].card, '5/5 _ 058');
  assert.equal(data.nominees[1].card, '');
  assert.equal(data.nominees[1].duty, 'Lái xe chở người ĐVCT 1 (không tham gia nhóm công tác)');
});

test('normalize: cấp phiếu — CHTT phải là CHTT của ĐVCT đã chọn; nhân viên phải thuộc danh sách đã đăng ký', () => {
  const input = baseInput({
    workUnits: [
      { commander: { personnelId: 'P1' }, members: [{ personnelId: 'P2' }] },
      { commander: { personnelId: 'P4' }, members: [{ personnelId: 'P3' }] }
    ],
    permits: [
      { isolation: 'Cô lập MC174; TC C12', workUnitSeq: 2, content: 'Thi công nhị thứ', workers: [{ personnelId: 'P3' }] }
    ]
  });
  const { data, errors } = normalizeRegistration(input, ctx);
  assert.deepEqual(errors, []);
  assert.equal(data.permits[0].permitNo, 1);
  assert.equal(data.permits[0].commander.name, 'Ngô Văn Quang', 'CHTT lấy theo ĐVCT được chọn');

  const bad = normalizeRegistration({
    ...input,
    permits: [{ isolation: 'x', workUnitSeq: 3, content: 'y', workers: [] },
      { isolation: 'x', workUnitSeq: 1, content: 'y', workers: [{ name: 'Người lạ' }] }]
  }, ctx);
  assert.deepEqual(bad.errors.map(e => e.field), ['permits.0.workUnitSeq', 'permits.1.workers']);
});

test('normalize: rủi ro giữ nội dung đã chọn/sửa, bỏ dòng rỗng', () => {
  const { data } = normalizeRegistration(baseInput({
    risks: [{ hazard: 'Phóng điện cảm ứng', measures: '- Tiếp đất', performer: 'Đơn vị công tác.' }, { hazard: '', measures: '' }]
  }), ctx);
  assert.equal(data.risks.length, 1);
});

test('personKey: cùng người thì cùng khóa, dù chọn từ danh mục hay tự ghi', () => {
  assert.equal(personKey({ personnelId: 'P1', name: 'A' }), 'id:P1');
  assert.equal(personKey({ name: ' Nguyễn  Văn A ' }), personKey({ name: 'nguyễn văn a' }));
});

test('draftFromOutage: điền sẵn nội dung, địa điểm, điều kiện (phạm vi) và thời gian, đánh dấu nguồn', () => {
  const draft = draftFromOutage({
    id: 'O1', regStart: '2024-10-05T07:00', regEnd: '2024-10-05T17:00',
    location: 'trạm 220kV Vân Phong.', content: 'TNĐK ngăn MC 200', scope: 'Cô lập MC 200'
  });
  assert.equal(draft.outageId, 'O1');
  assert.deepEqual(draft.workContent, { text: 'TNĐK ngăn MC 200', source: 'outage' });
  assert.equal(draft.workLocation, 'trạm 220kV Vân Phong.');
  assert.deepEqual(draft.condition, { text: 'Cô lập MC 200', source: 'outage' });
  assert.deepEqual(draft.time, { start: '2024-10-05T07:00', end: '2024-10-05T17:00', source: 'outage' });
  assert.equal(draft.workUnits.length, 1, 'mặc định 1 ĐVCT');
});

test('normalize: lọc ký tự điều khiển (làm hỏng file Word) và báo lỗi khi tên quá dài', () => {
  const { data } = normalizeRegistration(baseInput({ workLocation: 'Ngăn\u000b 174\u0007' }), ctx);
  assert.equal(data.workLocation, 'Ngăn 174');
  const { errors } = normalizeRegistration(baseInput({ recipient: { name: 'x'.repeat(256) }, leader: { name: 'y'.repeat(256) } }), ctx);
  assert.deepEqual(errors.map(e => e.field).sort(), ['leader', 'recipient']);
});

test('normalize: danh sách quá dài bị từ chối ngay (chống treo server)', () => {
  const started = Date.now();
  const { errors } = normalizeRegistration(baseInput({ workUnits: Array.from({ length: 33000 }, () => ({})) }), ctx);
  assert.ok(Date.now() - started < 500);
  assert.deepEqual(errors.map(e => e.field), ['workUnits']);
});
