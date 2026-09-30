const test = require('node:test');
const assert = require('node:assert/strict');
const { SURVEY } = require('./fixtures/sampleSurvey');

const load = () => import('../client/lib/survey.js');

test('qlvhRoleFor: chức vụ đại diện QLVH gợi ý theo đơn vị quản lý trạm', async () => {
  const { qlvhRoleFor } = await load();
  assert.equal(qlvhRoleFor('Trạm 220kV Bảo Lộc'), 'Trạm trưởng Trạm 220kV Bảo Lộc');
  assert.equal(qlvhRoleFor('Tổ thao tác lưu động Phan Thiết'), 'Tổ trưởng Tổ thao tác lưu động Phan Thiết');
  assert.equal(qlvhRoleFor('TBA 220kV Tháp Chàm'), 'Trạm trưởng TBA 220kV Tháp Chàm');
  assert.equal(qlvhRoleFor('Trung tâm vận hành Thuận Nam'), 'Trưởng trung tâm vận hành Thuận Nam');
  assert.equal(qlvhRoleFor(''), '');
});

test('stationFromCatalog / withQlvhFor: chọn TBA thì điền người phụ trách và chức vụ của đơn vị QLVH', async () => {
  const { stationFromCatalog, withQlvhFor } = await load();
  const subs = [{ id: 'TBA-1', name: 'TBA 220kV Tháp Chàm', stationId: 'ST-1', transmissionName: 'Truyền tải điện Khánh Hòa' }];
  const units = [{ id: 'ST-1', name: 'Tổ Thao tác lưu động Tháp Chàm', leaderName: 'Nguyễn Yên' }];
  const picked = stationFromCatalog('TBA-1', subs, units);
  assert.deepEqual(picked.station, { substationId: 'TBA-1', name: 'TBA 220kV Tháp Chàm', qlvhUnitId: 'ST-1', qlvhUnitName: 'Tổ Thao tác lưu động Tháp Chàm' });
  assert.equal(picked.transmissionName, 'Truyền tải điện Khánh Hòa');
  assert.equal(stationFromCatalog('KHONG', subs, units), null);

  const filled = withQlvhFor([], '', picked.station.qlvhUnitName, picked.leaderName);
  assert.deepEqual(filled, [{ honorific: 'Ông', name: 'Nguyễn Yên', role: 'Tổ trưởng Tổ Thao tác lưu động Tháp Chàm' }]);
  // đã ghi tên/chức vụ riêng thì giữ nguyên khi đổi trạm
  const kept = withQlvhFor([{ honorific: 'Bà', name: 'Lê Thị B', role: 'Trực chính' }], picked.station.qlvhUnitName, 'Tổ Thao tác lưu động Bảo Lộc', 'Nguyễn Tín Nghĩa');
  assert.deepEqual(kept, [{ honorific: 'Bà', name: 'Lê Thị B', role: 'Trực chính' }]);
});

test('roleOptions: gợi ý chức vụ đại diện ĐVCT và QLVH', async () => {
  const { workUnitRoleOptions, qlvhRoleOptions } = await load();
  assert.deepEqual(workUnitRoleOptions('TNLĐ').slice(0, 2), ['Tổ trưởng - Tổ TNLĐ', 'Tổ phó - Tổ TNLĐ']);
  assert.deepEqual(workUnitRoleOptions(''), []);
  assert.ok(qlvhRoleOptions('Trạm 220kV Bảo Lộc').includes('Trạm phó Trạm 220kV Bảo Lộc'));
  assert.deepEqual(qlvhRoleOptions(''), []);
});

test('registrationFromSurvey: giấy ĐKCT kế thừa căn cứ, nội dung, địa điểm, rủi ro từ biên bản', async () => {
  const { registrationFromSurvey } = await load();
  const r = registrationFromSurvey(SURVEY);
  assert.equal(r.header.basis, 'Biên bản khảo sát hiện trường ngày 21/7/2026');
  assert.deepEqual(r.workContent, { text: SURVEY.workContent, source: 'manual' });
  assert.equal(r.workLocation, 'Ngăn 275: TU275, TI275 tại Trạm biến áp 220kV Tháp Chàm');
  assert.deepEqual(r.risks, SURVEY.risks);
  assert.equal(r.outageId, null);
  assert.equal(r.recipient, undefined);
  const withUnit = registrationFromSurvey({ ...SURVEY, station: { ...SURVEY.station, qlvhUnitId: 'ST-1' } });
  assert.deepEqual(withUnit.recipient, { stationId: 'ST-1' }, 'nơi nhận = đơn vị QLVH của trạm');
});

test('markFromPoints: khung kéo theo mọi hướng, cắt trong ảnh, bỏ khung quá nhỏ', async () => {
  const { markFromPoints } = await load();
  assert.deepEqual(markFromPoints({ x: 0.5, y: 0.6 }, { x: 0.2, y: 0.1 }), { x: 0.2, y: 0.1, w: 0.3, h: 0.5, label: 'Khu vực công tác' });
  assert.deepEqual(markFromPoints({ x: -0.2, y: 0.9 }, { x: 0.1, y: 1.4 }, 'Ngăn 275'), { x: 0, y: 0.9, w: 0.1, h: 0.1, label: 'Ngăn 275' });
  assert.equal(markFromPoints({ x: 0.5, y: 0.5 }, { x: 0.502, y: 0.7 }), null);
});

test('renderScale: 200 dpi, giới hạn cạnh dài', async () => {
  const { renderScale } = await load();
  assert.equal(renderScale(842, 595), 200 / 72);           // A4 ngang: ~2339 × 1653
  assert.equal(renderScale(3370, 2384), 6000 / 3370);      // A0: giới hạn 6000 điểm ảnh
});

test('surveyTimeLabel: nhãn thời điểm trong danh sách', async () => {
  const { surveyTimeLabel } = await load();
  assert.equal(surveyTimeLabel('2026-07-21T09:30'), '09:30 21/07/2026');
  assert.equal(surveyTimeLabel(''), '');
});
