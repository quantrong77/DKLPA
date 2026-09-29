const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../client/lib/form.js');

const hoang = { personnelId: 'P1', name: 'Trần Văn Hoàng', safetyLevel: '5/5', safetyCard: '058' };
const quynh = { personnelId: 'P2', name: 'Kim Văn Quỳnh', safetyLevel: '5/5', safetyCard: '066' };
const quang = { personnelId: 'P4', name: 'Ngô Văn Quang', safetyLevel: '5/5', safetyCard: '057' };
const giap = { personnelId: null, name: 'Mai Văn Giáp', safetyLevel: '', safetyCard: '' };

test('fillDuty thay {n} bằng số ĐVCT', async () => {
  const { fillDuty } = await load();
  assert.equal(fillDuty('Nhân viên đơn vị công tác {n}', 2), 'Nhân viên đơn vị công tác 2');
  assert.equal(fillDuty('Người cảnh giới', 2), 'Người cảnh giới');
});

test('resizeWorkUnits: thêm ĐVCT trống hoặc bớt ĐVCT cuối, tối thiểu 1', async () => {
  const { resizeWorkUnits } = await load();
  const one = [{ commander: hoang, members: [quynh] }];
  const three = resizeWorkUnits(one, 3);
  assert.equal(three.length, 3);
  assert.equal(three[0], one[0]);
  assert.equal(three[2].commander, null);
  assert.equal(resizeWorkUnits(three, 0).length, 1);
  assert.equal(resizeWorkUnits(three, 2).length, 2);
});

test('nomineesFromUnits: CHTT rồi nhân viên của từng ĐVCT, giữ người thêm tay (lái xe)', async () => {
  const { nomineesFromUnits } = await load();
  const rows = nomineesFromUnits(
    [{ commander: hoang, members: [quynh] }, { commander: quang, members: [quynh] }],
    [{ person: giap, duty: 'Lái xe chở người ĐVCT 1 (không tham gia nhóm công tác)' }, { person: hoang, duty: 'cũ' }]
  );
  assert.deepEqual(rows.map(r => [r.person.name, r.duty]), [
    ['Trần Văn Hoàng', 'Chỉ huy trực tiếp đơn vị công tác 1'],
    ['Kim Văn Quỳnh', 'Nhân viên đơn vị công tác 1'],
    ['Ngô Văn Quang', 'Chỉ huy trực tiếp đơn vị công tác 2'],
    ['Kim Văn Quỳnh', 'Nhân viên đơn vị công tác 2'],
    ['Mai Văn Giáp', 'Lái xe chở người ĐVCT 1 (không tham gia nhóm công tác)']
  ]);
});

test('registeredPeople: CHTT, nhân viên ĐVCT và người đề cử, không trùng', async () => {
  const { registeredPeople } = await load();
  const people = registeredPeople({
    workUnits: [{ commander: hoang, members: [quynh] }, { commander: quang, members: [quynh] }],
    nominees: [{ person: giap }, { person: hoang }]
  });
  assert.deepEqual(people.map(p => p.name), ['Trần Văn Hoàng', 'Kim Văn Quỳnh', 'Ngô Văn Quang', 'Mai Văn Giáp']);
});

test('pruneAfterChange: gỡ nhân viên không còn đăng ký khỏi phiếu, báo lại tên đã gỡ', async () => {
  const { pruneAfterChange } = await load();
  const form = {
    workUnits: [{ commander: hoang, members: [] }],
    nominees: [],
    permits: [{ workUnitSeq: 1, workers: [quynh, hoang] }, { workUnitSeq: 3, workers: [] }]
  };
  const { form: next, removed } = pruneAfterChange(form);
  assert.deepEqual(next.permits[0].workers.map(w => w.name), ['Trần Văn Hoàng']);
  assert.equal(next.permits[1].workUnitSeq, null, 'ĐVCT đã bị bớt');
  assert.deepEqual(removed, ['Kim Văn Quỳnh']);
});

test('fromSaved: dữ liệu giấy đã lưu -> trạng thái form (có số ĐVCT)', async () => {
  const { fromSaved } = await load();
  const form = fromSaved({ workUnits: [{ seq: 1, commander: hoang, members: [quynh], memberCount: 1 }], nominees: [], permits: [], risks: [] });
  assert.equal(form.workUnitCount, 1);
  assert.equal(form.workUnits[0].commander.name, 'Trần Văn Hoàng');
  assert.deepEqual(form.supervisors, []);
});

test('fieldErrors: gom lỗi theo tiền tố trường để hiển thị cạnh ô nhập', async () => {
  const { fieldErrors } = await load();
  const map = fieldErrors([{ field: 'workUnits.0.commander', message: 'A' }, { field: 'time', message: 'B' }]);
  assert.equal(map['workUnits.0.commander'], 'A');
  assert.equal(map.time, 'B');
});

test('personLabel: tên kèm Bậc ATĐ và số thẻ', async () => {
  const { personLabel } = await load();
  assert.equal(personLabel({ fullName: 'A', safetyLevel: '5/5', safetyCard: '058' }), 'A · 5/5 _ 058');
  assert.equal(personLabel({ fullName: 'B' }), 'B');
});

test('removeWorkUnit: xóa ĐVCT ở giữa thì phiếu của ĐVCT đó bỏ chọn, phiếu sau lùi số', async () => {
  const { removeWorkUnit } = await load();
  const form = {
    workUnits: [{ commander: hoang, members: [] }, { commander: quang, members: [] }, { commander: giap, members: [] }],
    permits: [{ workUnitSeq: 1 }, { workUnitSeq: 2 }, { workUnitSeq: 3 }, { workUnitSeq: null }]
  };
  const next = removeWorkUnit(form, 1);
  assert.deepEqual(next.workUnits.map(u => u.commander.name), ['Trần Văn Hoàng', 'Mai Văn Giáp']);
  assert.deepEqual(next.permits.map(p => p.workUnitSeq), [1, null, 2, null]);
  assert.equal(next.workUnitCount, 2);
});

test('unitHasData: ĐVCT đã khai người hoặc thời gian/địa điểm', async () => {
  const { unitHasData, emptyWorkUnit } = await load();
  assert.equal(unitHasData(emptyWorkUnit()), false);
  assert.equal(unitHasData({ ...emptyWorkUnit(), members: [hoang] }), true);
  assert.equal(unitHasData({ ...emptyWorkUnit(), location: 'Ngăn 174' }), true);
});

test('sameName: so khớp tên có dấu (không gộp "Tư" với "Tú")', async () => {
  const { sameName } = await load();
  assert.equal(sameName('  trần  văn tú ', 'Trần Văn Tú'), true);
  assert.equal(sameName('Trần Văn Tư', 'Trần Văn Tú'), false);
});

test('fillDuty / unitLabel / nomineesFromUnits: 1 ĐVCT thì không đánh số', async () => {
  const { fillDuty, unitLabel, nomineesFromUnits } = await load();
  assert.equal(fillDuty('Nhân viên đơn vị công tác {n}', 1, 1), 'Nhân viên đơn vị công tác');
  assert.equal(fillDuty('Lái xe chở người ĐVCT {n} (không tham gia nhóm công tác)', 1, 1), 'Lái xe chở người ĐVCT (không tham gia nhóm công tác)');
  assert.equal(fillDuty('Nhân viên đơn vị công tác {n}', 2, 3), 'Nhân viên đơn vị công tác 2');
  assert.equal(unitLabel(0, 1), 'ĐVCT');
  assert.equal(unitLabel(1, 3), 'ĐVCT2');
  const rows = nomineesFromUnits([{ commander: hoang, members: [quynh] }]);
  assert.deepEqual(rows.map(r => r.duty), ['Chỉ huy trực tiếp đơn vị công tác', 'Nhân viên đơn vị công tác']);
});
