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
