const test = require('node:test');
const assert = require('node:assert/strict');
const DEVICES = require('../server/seeds/tests1901.json');
const { SURVEY } = require('./fixtures/sampleSurvey');

const load = () => import('../client/lib/plan.js');
const dev = (key) => DEVICES.find(d => d.key === key);
const names = (items) => items.map(i => `${i.level ? '  ' : ''}${i.name}`);

test('cycleColumns: 3 năm gồm hạng mục 1 năm; 6 năm gồm 3 năm và 1 năm (Điều 3)', async () => {
  const { cycleColumns } = await load();
  assert.deepEqual(cycleColumns('y6'), ['y6', 'y3', 'annual']);
  assert.deepEqual(cycleColumns('install'), ['install']);
});

test('itemsFor MBA định kỳ 3 năm: theo đúng cột của Bảng 1 QĐ 1901', async () => {
  const { itemsFor } = await load();
  const items = names(itemsFor(dev('MBA'), 'y3'));
  // có: hạng mục 3 năm + 1 năm (dầu, PD); TI chân sứ chỉ các mục con có x ở cột 3 năm
  for (const n of ['Kiểm tra bên ngoài', 'Đo điện trở 1 chiều của các cuộn dây ở tất cả các nấc', 'Đo tỉ số biến các cuộn dây ở tất cả các nấc',
    'Kiểm tra các biến dòng lắp sẵn (TI chân sứ)', '  - Đặc tính từ hoá', 'Kiểm tra dầu cách điện', '  Đo điện áp chọc thủng Uct', 'Kiểm tra phóng điện cục bộ PD']) {
    assert.ok(items.includes(n), n);
  }
  // không có: hạng mục chỉ làm sau lắp đặt / 1 năm sau lắp đặt
  for (const n of ['Đo dòng không tải và tổn thất không tải', 'Đo tổn hao ngắn mạch và điện áp ngắn mạch', '  - Tỷ số biến và cực tính',
    'Kiểm tra phản hồi tần số FRA']) {
    assert.ok(!items.includes(n), n);
  }
});

test('itemsFor: bỏ hạng mục cha khi không có hạng mục con thuộc chu kỳ; 6 năm máy cắt SF6 có phân tích SO2', async () => {
  const { itemsFor } = await load();
  const ti = names(itemsFor(dev('TI_DAU'), 'y3'));
  assert.ok(!ti.includes('Kiểm tra đo lường'), 'đo lường chỉ làm sau lắp đặt');
  assert.ok(names(itemsFor(dev('TI_DAU'), 'install')).includes('  Xác định sai số cơ bản'));
  assert.ok(names(itemsFor(dev('MC_SF6'), 'y6')).includes('Phân tích khí phân rã trong khí SF6 (đo hàm lượng khí SO2)'));
  assert.ok(!names(itemsFor(dev('MC_SF6'), 'y3')).includes('Phân tích khí phân rã trong khí SF6 (đo hàm lượng khí SO2)'));
});

test('testGroupFor / devicesFromSteps / defaultRecipients / planFromSurvey', async () => {
  const { testGroupFor, devicesFromSteps, defaultRecipients, planFromSurvey, defaultWorkload } = await load();
  const g = testGroupFor(dev('DCL'), 'y3', 'DAO CÁCH LY 532-2, 532-8');
  assert.equal(g.label, 'DAO CÁCH LY 532-2, 532-8');
  assert.equal(g.items.length, 10);
  assert.equal(testGroupFor(dev('DCL'), 'y3').label, 'DAO CÁCH LY, DAO TIẾP ĐỊA');

  assert.deepEqual(devicesFromSteps(['Cắt điện: mở MC 530, MC532, mở các DCL 530-6, 530-8; đóng các DTĐ 530-65', 'mở MC 530']),
    ['MC530', 'MC532', '530-6', '530-8', '530-65']);

  const form = { header: { transmissionName: 'Truyền tải điện Lâm Đồng', teamShort: 'TNLĐ' }, station: { qlvhShort: 'TBAVT' }, bays: '530, 532' };
  assert.deepEqual(defaultRecipients(form), ['TTĐ Lâm Đồng;', 'TBAVT;', 'Lưu: VT, Tổ TNLĐ.']);
  assert.equal(defaultWorkload(form), 'Kiểm tra thí nghiệm định kỳ các thiết bị nhất thứ thuộc ngăn lộ 530, 532.');

  const p = planFromSurvey({ station: {}, equipmentText: '', outageId: null }, { id: 'KS-1', data: SURVEY });
  assert.equal(p.surveyId, 'KS-1');
  assert.equal(p.station.name, 'Trạm biến áp 220kV Tháp Chàm');
  assert.equal(p.equipmentText, 'Ngăn 275: TU275, TI275');
  assert.equal(p.risks.length, 2);
});

test('suggestDrawings: TBA 500kV chọn sơ đồ theo cấp điện áp của ngăn lộ; AT hoặc không rõ thì chọn cả hai', async () => {
  const { suggestDrawings, voltagesIn, drawingVoltage } = await load();
  const two = [{ id: 'A', label: 'Phía 500kV' }, { id: 'B', label: 'Phía 220kV' }];
  assert.equal(drawingVoltage('Sơ đồ phía 220 kV'), 220);
  assert.equal(drawingVoltage('Sơ đồ trạm'), null);
  assert.deepEqual([...voltagesIn('MC532, 232-2, năm 2026, 35kV')].sort((a, b) => a - b), [35, 220, 500]);
  assert.deepEqual(suggestDrawings(two, '530, 532'), ['A']);
  assert.deepEqual(suggestDrawings(two, 'ngăn 232, 255'), ['B']);
  assert.deepEqual(suggestDrawings(two, '532, 232'), ['A', 'B']);
  assert.deepEqual(suggestDrawings(two, 'MBA AT2'), ['A', 'B'], 'MBA tự ngẫu nối hai phía');
  assert.deepEqual(suggestDrawings(two, 'hệ thống nối đất'), ['A', 'B'], 'không suy ra được thì chọn tất cả');
  assert.deepEqual(suggestDrawings([{ id: 'C', label: 'Sơ đồ trạm' }], '232'), ['C']);
  assert.deepEqual(suggestDrawings([], '232'), []);
});

test('planFromSurvey: đổi trạm thì bỏ lựa chọn sơ đồ cũ để gợi ý lại', async () => {
  const { planFromSurvey } = await load();
  const draft = { station: { substationId: 'TBA-1' }, drawingIds: ['A'], risks: [] };
  assert.equal(planFromSurvey(draft, { id: 'KS', data: { station: { substationId: 'TBA-2', name: 'X' }, risks: [] } }).drawingIds, null);
  assert.deepEqual(planFromSurvey(draft, { id: 'KS', data: { station: { substationId: 'TBA-1', name: 'X' }, risks: [] } }).drawingIds, ['A']);
});

test('baysFromScope: ngăn lộ cắt điện cô lập từ phạm vi cắt điện của lịch, gộp dòng và bỏ gạch đầu dòng', async () => {
  const { baysFromScope } = await load();
  assert.equal(baysFromScope('- Cô lập MC232\r\n\n• Đóng DTĐ 232-25 '), 'Cô lập MC232; Đóng DTĐ 232-25');
  assert.equal(baysFromScope('Ngăn 272'), 'Ngăn 272');
  assert.equal(baysFromScope(null), '');
});

test('registrationFromPlan: giấy ĐKCT lấy căn cứ, nội dung, địa điểm, thời gian, rủi ro, nơi nhận và giữ liên kết', async () => {
  const { registrationFromPlan } = await load();
  const plan = {
    id: 'PA-1', docNumber: '12/PA-TNLĐ.Nhatthu',
    data: {
      workType: 'Thí nghiệm định kỳ', equipmentText: 'MBA AT1', bays: 'Ngăn 231, 131',
      station: { substationId: 'TBA-1', name: 'TBA 220kV Bảo Lộc', qlvhUnitId: 'ST-1' },
      time: { start: '2026-10-12T07:00', end: '2026-10-12T17:00' },
      risks: [{ hazard: 'Điện cảm ứng', measures: 'Nối đất', performer: 'ĐVCT', extra: 1 }],
      surveyId: 'KS-1', outageId: null, workId: 'CV-1'
    }
  };
  const r = registrationFromPlan(plan);
  assert.equal(r.header.basis, 'Phương án thi công, biện pháp an toàn số 12/PA-TNLĐ.Nhatthu');
  assert.deepEqual(r.workContent, { text: 'Thí nghiệm định kỳ MBA AT1', source: 'manual' });
  assert.equal(r.workLocation, 'Ngăn 231, 131 tại TBA 220kV Bảo Lộc');
  assert.deepEqual(r.time, { start: '2026-10-12T07:00', end: '2026-10-12T17:00', source: 'manual' });
  assert.deepEqual(r.risks, [{ hazard: 'Điện cảm ứng', measures: 'Nối đất', performer: 'ĐVCT' }]);
  assert.deepEqual([r.planId, r.surveyId, r.outageId, r.workId], ['PA-1', 'KS-1', null, 'CV-1']);
  assert.deepEqual(r.recipient, { stationId: 'ST-1' });
  // nội dung đã bắt đầu bằng loại công việc thì không lặp; chưa có giờ thì không ghi đè thời gian của form
  const r2 = registrationFromPlan({ id: 'PA-2', data: { workType: 'Kiểm tra', equipmentText: 'Kiểm tra tủ ngăn 271', station: {} } });
  assert.equal(r2.workContent.text, 'Kiểm tra tủ ngăn 271');
  assert.equal('time' in r2, false);
  assert.equal(r2.recipient, undefined);
});

test('sentenceCase / equipmentFromGroups: điền sẵn bảng thiết bị cần thí nghiệm từ Phụ lục I', async () => {
  const { sentenceCase, equipmentFromGroups } = await load();
  assert.deepEqual(['MÁY CẮT SF6', 'MBA TỰ DÙNG', 'BIẾN DÒNG ĐIỆN (kiểu hở, có ống thở)', 'DAO CÁCH LY, DAO TIẾP ĐỊA', 'Máy cắt'].map(sentenceCase),
    ['Máy cắt SF6', 'MBA tự dùng', 'Biến dòng điện (kiểu hở, có ống thở)', 'Dao cách ly, dao tiếp địa', 'Máy cắt']);
  const rows = equipmentFromGroups([
    { deviceKey: 'MC_SF6', cycle: 'y3', label: 'MÁY CẮT 530, 532', items: [{ name: 'a' }, { name: 'b', checked: false }, { name: 'c' }] },
    { deviceKey: 'MBA', cycle: 'y6', label: 'MBA AT2', items: [{ name: 'a' }] },
    { deviceKey: 'DCL', cycle: 'annual', label: 'DAO CÁCH LY', items: [] },
    { deviceKey: '', cycle: null, label: 'Tủ RMU 471', items: [{ name: 'a' }] },
    { deviceKey: 'TI_SF6', cycle: 'y3', label: 'BIẾN DÒNG ĐIỆN TI 272', items: [] }
  ], DEVICES);
  assert.deepEqual(rows, [
    { name: 'Máy cắt', position: 'MC 530, 532', note: '3 năm', deviceKey: 'MC_SF6' },
    { name: 'Máy biến áp', position: 'MBA AT2', note: '6 năm', deviceKey: 'MBA' },
    { name: 'Dao cách ly (Dao tiếp địa)', position: '', note: '1 năm', deviceKey: 'DCL' },
    { name: 'Tủ RMU', position: '471', note: '', deviceKey: '' },
    { name: 'Biến dòng điện', position: 'TI 272', note: '3 năm', deviceKey: 'TI_SF6' }
  ]);
  // như mẫu phương án: Máy cắt | MC 572 | 6 năm; Chống sét van | CS 572; DCL giữ dao tiếp địa trong ngoặc
  assert.deepEqual(equipmentFromGroups([
    { deviceKey: 'MC_SF6', cycle: 'y6', label: 'MÁY CẮT 572' }, { deviceKey: 'TU_TU', cycle: 'y3', label: 'BIẾN ĐIỆN ÁP 572' },
    { deviceKey: 'CSV', cycle: 'y3', label: 'CHỐNG SÉT VAN 572' }, { deviceKey: 'DCL', cycle: 'y3', label: 'DAO CÁCH LY 572-7 (572-74, 572-76)' }
  ], DEVICES).map(r => [r.name, r.position, r.note]), [
    ['Máy cắt', 'MC 572', '6 năm'], ['Biến điện áp', 'TU 572', '3 năm'], ['Chống sét van', 'CS 572', '3 năm'],
    ['Dao cách ly (Dao tiếp địa)', 'DCL 572-7 (572-74, 572-76)', '3 năm']
  ]);
  assert.deepEqual(equipmentFromGroups([], DEVICES), []);
});

test('equipmentOptions / equipmentDevices / deviceCycles / withCycle: chọn thiết bị QĐ 1901 và chu kỳ của thiết bị đó', async () => {
  const { equipmentOptions, equipmentDevices, deviceCycles, noteCycle, withCycle } = await load();
  const opts = equipmentOptions(DEVICES);
  assert.equal(opts.length, DEVICES.length + 1, 'mọi loại QĐ 1901 và Tụ bù dọc');
  assert.deepEqual(['MBA', 'MC_SF6', 'DCL', 'TI_HO'].map(k => opts.find(o => o.key === k).label),
    ['Máy biến áp', 'Máy cắt SF6', 'Dao cách ly (Dao tiếp địa)', 'Biến dòng điện (kiểu hở, có ống thở)']);
  // theo deviceKey, theo tên trong danh sách, theo tên gọn (cả nhóm), tên tự ghi
  assert.deepEqual(equipmentDevices({ name: 'Máy cắt', deviceKey: 'MC_SF6' }, DEVICES).map(d => d.key), ['MC_SF6']);
  assert.deepEqual(equipmentDevices({ name: 'máy cắt chân không' }, DEVICES).map(d => d.key), ['MC_CK']);
  assert.deepEqual(equipmentDevices({ name: 'Máy cắt' }, DEVICES).map(d => d.key), ['MC_DAU', 'MC_SF6', 'MC_CK']);
  assert.deepEqual(equipmentDevices({ name: 'Máy biến áp tự dùng T1' }, DEVICES).map(d => d.key), ['MBA_TD']);
  assert.deepEqual(equipmentDevices({ name: 'Tủ RMU' }, DEVICES), []);
  // chu kỳ có hạng mục: máy cắt SF6 không có hạng mục 1 năm; MBA không có 6 năm
  const dev = (k) => DEVICES.filter(d => d.key === k);
  assert.deepEqual(deviceCycles(dev('MC_SF6')), ['install', 'year1', 'y3', 'y6']);
  assert.deepEqual(deviceCycles(dev('MBA')), ['install', 'year1', 'annual', 'y3']);
  assert.deepEqual(deviceCycles(dev('ND')), ['install', 'year1', 'annual']);
  // chu kỳ ghi ở đầu ghi chú: thay chu kỳ cũ, giữ phần còn lại
  assert.equal(noteCycle('Sau 1 năm; đo tgδ'), 'year1');
  assert.equal(noteCycle('Định kỳ 3 năm'), 'y3');
  assert.equal(noteCycle('12 năm'), '');
  assert.equal(withCycle('', 'y6'), '6 năm');
  assert.equal(withCycle('3 năm; đo điện trở tiếp xúc', 'y6'), '6 năm; đo điện trở tiếp xúc');
  assert.equal(withCycle('Đo điện trở tiếp xúc', 'annual'), '1 năm; Đo điện trở tiếp xúc');
  assert.equal(withCycle('6 năm; ghi chú', ''), 'ghi chú');
});

test('isolationRows / addIsolationDevices: mặc định Mở cho MC, DCL; Đóng cho dao tiếp địa; không thêm trùng', async () => {
  const { isolationRows, addIsolationDevices, defaultIsolationState } = await load();
  assert.deepEqual(['MC565', '565-1', '565-7', '565-65', '565-85', '232-38', 'DTĐ 571'].map(defaultIsolationState),
    ['open', 'open', 'open', 'closed', 'closed', 'closed', 'closed']);
  assert.deepEqual(isolationRows(['MC530', { name: '530-65', receive: 'open', handover: 'closed' }]), [
    { name: 'MC530', receive: 'open', handover: 'open' },
    { name: '530-65', receive: 'open', handover: 'closed' }
  ]);
  const next = addIsolationDevices(['MC530'], ['MC530', '530-65']);
  assert.deepEqual(next.map(r => [r.name, r.receive, r.handover]), [['MC530', 'open', 'open'], ['530-65', 'closed', 'closed']]);
});

test('phụ lục đính kèm: tên gợi ý Phụ lục V, VI…; dòng "Chi tiết thực hiện" in theo tên phụ lục', async () => {
  const { attachmentLabel, detailText } = await load();
  assert.deepEqual([0, 1, 5].map(attachmentLabel), ['Phụ lục V', 'Phụ lục VI', 'Phụ lục X']);
  assert.equal(detailText([]), '');
  assert.equal(detailText([{ label: 'Phụ lục V' }, { label: '  ' }]), 'Chi tiết thực hiện: theo Phụ lục V, Phụ lục VI đính kèm.');
});

test('bảng thiết bị cần thí nghiệm: Tụ bù dọc (1 năm, 3 năm); mọi thiết bị thêm chu kỳ Đột xuất, Sửa chữa', async () => {
  const { equipmentOptions, equipmentCycles, noteCycle, withCycle, EQUIPMENT_CYCLE_LABELS, CYCLE_LABELS } = await load();
  const tbd = equipmentOptions(DEVICES).find(o => o.label === 'Tụ bù dọc');
  assert.equal(tbd.key, 'TBD');
  assert.deepEqual(equipmentCycles({ name: 'Tụ bù dọc', deviceKey: 'TBD' }, DEVICES), ['annual', 'y3', 'adhoc', 'repair']);
  assert.deepEqual(equipmentCycles({ name: 'tụ bù dọc' }, DEVICES), ['annual', 'y3', 'adhoc', 'repair'], 'theo tên');
  assert.deepEqual(equipmentCycles({ name: 'Máy cắt SF6', deviceKey: 'MC_SF6' }, DEVICES), ['install', 'year1', 'y3', 'y6', 'adhoc', 'repair']);
  assert.deepEqual(equipmentCycles({ name: 'Tủ điều khiển' }, DEVICES), ['install', 'year1', 'annual', 'y3', 'y6', 'adhoc', 'repair'], 'tên tự ghi');
  assert.equal(EQUIPMENT_CYCLE_LABELS.adhoc, 'Đột xuất');
  assert.equal(CYCLE_LABELS.adhoc, undefined, 'Phụ lục I vẫn chỉ theo chu kỳ QĐ 1901');
  assert.equal(withCycle('đo điện dung', 'adhoc'), 'Đột xuất; đo điện dung');
  assert.equal(noteCycle('Sửa chữa; thay sứ'), 'repair');
  assert.equal(withCycle('Đột xuất; đo điện dung', 'y3'), '3 năm; đo điện dung');
  assert.equal(withCycle('Sửa chữa', ''), '');
});
