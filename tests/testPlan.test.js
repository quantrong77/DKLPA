const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { startApp } = require('./helpers/app');
const { parseWorkbook, normalizeSource, stationKey, deviceKeyOf, exportUrl } = require('../server/services/testPlan');

// bảng như sheet "Cập nhật 2027": A TT, B Truyền tải, C Trạm, D Ngăn lộ, E Mã KL, F Mã TB, G Thiết bị, H…P chu kỳ, Q KĐAT, …, X Khối lượng TNĐK
const HEAD = ['TT', 'Truyền tải điện', 'Tên trạm biến áp', 'Ngăn lộ', 'Mã KL', 'Mã TB', 'Danh mục thiết bị TNĐK', '1VH', 'HN', '1DK1', '1DK2', '3DK', '3DK1', '3DK2', '6DK', 'TC', 'KĐ', 'Chu kỳ', 'Ghi chú', 'Ngày TN'];
const row = (o) => {
  const r = Array(24).fill('');
  Object.entries(o).forEach(([col, v]) => { r[col.charCodeAt(0) - 65] = v; });
  return r;
};
function workbook(sheet = 'Cập nhật 2027') {
  const DN = 'TBA 220kV Đắk Nông';
  const rows = [HEAD, Array(24).fill('code'),
    row({ A: 1, B: 'TTĐ Lâm Đồng', C: DN, D: 'AT1', F: 'MB', G: 'MBA AT1', L: 'x', X: '1' }),
    row({ A: 2, B: 'TTĐ Lâm Đồng', C: DN, D: '231', F: 'MC', G: 'MC 231', O: 'x', Q: 'KĐ', X: '1', S: 'Thay dầu' }),
    row({ A: 3, B: 'TTĐ Lâm Đồng', C: DN, D: '431', F: 'MC', G: 'MC 431', L: 'x', X: '1' }),
    row({ A: 4, B: 'TTĐ Lâm Đồng', C: DN, D: 'C11', F: 'TU', G: 'TU C11', P: 'x', K: 'x', X: '1' }),
    row({ A: 5, B: 'TTĐ Lâm Đồng', C: DN, D: 'AT1', F: 'Rơ', G: 'Rơle công nghệ', L: 'x', X: '1' }),
    row({ A: 6, B: 'TTĐ Lâm Đồng', C: DN, D: '172', F: 'TU', G: 'TU 172', H: 'x', X: '1' }), // 1VH (sau 1 năm lắp đặt)
    row({ A: 9, B: 'TTĐ Lâm Đồng', C: DN, D: '173', F: 'TU', G: 'TU 173', I: 'x', X: '1' }), // chỉ HN: không lấy
    row({ A: 7, B: 'TTĐ Lâm Đồng', C: DN, D: '232', F: 'TI', G: 'TI 232', L: 'x', X: '0' }), // không TNĐK năm này
    row({ A: 8, B: 'TTĐ Gia Lai', C: 'TBA 220kV An Khê', D: 'AT1', F: 'CS', G: 'CSV1AT1', Q: 'KĐ', X: '1' }), // chỉ kiểm định AT
    row({ C: 'Tổng', G: 'Cộng', L: '1579', O: '550', X: '2710' }) // dòng tổng: số đếm, không phải đánh dấu
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Ghi chú']]), 'Ghi chú');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheet);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('kế hoạch: lấy dòng có TNĐK (X = 1) và đánh dấu chu kỳ H / L / O / P hoặc kiểm định AT (Q); bỏ dòng tổng', () => {
  const { items, report } = parseWorkbook(workbook(), normalizeSource({}));
  assert.deepEqual(items.map(i => i.deviceName), ['MBA AT1', 'MC 231', 'MC 431', 'TU C11', 'Rơle công nghệ', 'TU 172', 'CSV1AT1']);
  assert.equal(report.selected, 7);
  assert.deepEqual(report.stations, [{ name: 'TBA 220kV An Khê', count: 1 }, { name: 'TBA 220kV Đắk Nông', count: 6 }]);
  const [mba, mc231, mc431, tu, rele, tu172, csv] = items;
  assert.deepEqual([tu172.deviceKey, tu172.cycles], ['TU_TU', ['year1']], 'cột H: sau 1 năm lắp đặt');
  assert.deepEqual([mba.deviceKey, mba.cycles, mba.inspection, mba.rowNo], ['MBA', ['y3'], false, 3]);
  assert.deepEqual([mc231.deviceKey, mc231.cycles, mc231.inspection, mc231.note], ['MC_SF6', ['y6'], true, 'Thay dầu']);
  assert.equal(mc431.deviceKey, 'MC_CK', 'ngăn 22kV: máy cắt chân không');
  assert.deepEqual([tu.deviceKey, tu.cycles], ['TU_TU', ['tc']], 'thanh cái 110kV: TU kiểu tụ; cột K không cấu hình');
  assert.equal(rele.deviceKey, '', 'rơle: không có bảng QĐ 1901');
  assert.deepEqual([csv.cycles, csv.inspection], [[], true]);
  // thêm cột chu kỳ I (HN): lấy cả TU 173
  const more = parseWorkbook(workbook(), normalizeSource({ columns: { cycles: { H: 'year1', I: 'annual', L: 'y3', O: 'y6', P: 'tc' } } }));
  assert.ok(more.items.some(i => i.deviceName === 'TU 173' && i.cycles[0] === 'annual'));
  assert.throws(() => parseWorkbook(workbook('Khác'), normalizeSource({})), { status: 422 });
});

test('kế hoạch: so tên trạm không dấu, loại thiết bị theo mã + cấp điện áp, link Google Sheet -> link tải .xlsx', () => {
  assert.equal(stationKey('TBA 220kV Đắk Nông'), stationKey('TBA 220KV Đăk Nông'));
  assert.equal(stationKey('Trạm biến áp 220kV Đắk Nông'), '220kv dak nong');
  assert.equal(deviceKeyOf('TI', 'TI 531', '531'), 'TI_DAU');
  assert.equal(deviceKeyOf('TI', 'TI 431', '431'), 'TI_35');
  assert.equal(deviceKeyOf('MB', 'MBA tự dùng TD41', 'TD41'), 'MBA_TD');
  assert.equal(deviceKeyOf('DC', 'DCL 231-3', '231'), 'DCL');
  assert.equal(deviceKeyOf('TB', 'TBD 502', 'TBD 502'), 'TBD', 'tụ bù dọc');
  assert.equal(deviceKeyOf('Rơ', 'Rơle công nghệ', 'AT1'), '');
  assert.equal(exportUrl('https://docs.google.com/spreadsheets/d/1icW3tb-q_X/edit?gid=607880115#gid=607880115'), 'https://docs.google.com/spreadsheets/d/1icW3tb-q_X/export?format=xlsx');
  const s = normalizeSource({ year: 'x', columns: { station: 'ab', bay: '1', cycles: { l: 'y3', Z: 'khác' } } });
  assert.deepEqual([s.year, s.columns.station, s.columns.bay, s.columns.cycles], [2027, 'AB', 'D', { L: 'y3' }]);
});

test('kế hoạch theo năm: admin thêm / sửa / đồng bộ (file .xlsx / link) / xóa; mọi người xem thiết bị của trạm theo năm', async () => {
  let reply = () => new Response('<html>Đăng nhập Google</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  const app = await startApp({ testPlanFetch: async () => reply() });
  const form = (name = 'TNĐK 2027.xlsx') => {
    const f = new FormData();
    f.append('fileName', name);
    f.append('file', new Blob([workbook()]), 'file');
    return f;
  };
  const DN = encodeURIComponent('TBA 220kV Đăk Nông');
  try {
    assert.equal((await app.call('lead', 'GET', '/test-plan/plans')).status, 403);
    assert.deepEqual((await app.call('admin', 'GET', '/test-plan/plans')).body.plans, []);
    assert.equal((await app.call('admin', 'POST', '/test-plan/plans/2027/sync', form())).status, 404, 'chưa thêm kế hoạch năm');

    const add = (await app.call('admin', 'PUT', '/test-plan/plans/2027', { url: 'https://docs.google.com/spreadsheets/d/ABC/edit' })).body;
    assert.deepEqual([add.plan.year, add.plan.sheet, add.plan.columns.cycles], [2027, 'Cập nhật 2027', { H: 'year1', L: 'y3', O: 'y6', P: 'tc' }]);
    // sheet chưa chia sẻ bằng link: Google trả trang đăng nhập
    const denied = await app.call('admin', 'POST', '/test-plan/plans/2027/sync', {});
    assert.equal(denied.status, 422);
    assert.match(denied.body.error, /Bất kỳ ai có đường liên kết/);

    assert.equal((await app.call('lead', 'POST', '/test-plan/plans/2027/sync', form())).status, 403);
    const synced = (await app.call('admin', 'POST', '/test-plan/plans/2027/sync', form())).body;
    assert.deepEqual([synced.status.selected, synced.status.year, synced.status.from], [7, 2027, 'TNĐK 2027.xlsx']);
    assert.equal(synced.plans[0].status.selected, 7, 'trạng thái lưu theo kế hoạch năm');

    const got = (await app.call('member', 'GET', `/test-plan/items?station=${DN}&year=2027`)).body;
    assert.deepEqual([got.year, got.years], [2027, [2027]]);
    assert.deepEqual(got.items.map(i => [i.bay, i.deviceName, i.deviceKey, i.cycles, i.inspection]), [
      ['AT1', 'MBA AT1', 'MBA', ['y3'], false], ['231', 'MC 231', 'MC_SF6', ['y6'], true], ['431', 'MC 431', 'MC_CK', ['y3'], false],
      ['C11', 'TU C11', 'TU_TU', ['tc'], false], ['AT1', 'Rơle công nghệ', '', ['y3'], false], ['172', 'TU 172', 'TU_TU', ['year1'], false]
    ]);

    // năm sau: thêm kế hoạch, chép cột của năm gần nhất (đổi cột năm 2028 không ảnh hưởng 2027)
    const next = (await app.call('admin', 'PUT', '/test-plan/plans/2028', {})).body;
    assert.deepEqual([next.plan.sheet, next.plan.url, next.plan.columns.cycles], ['Cập nhật 2028', '', { H: 'year1', L: 'y3', O: 'y6', P: 'tc' }]);
    assert.deepEqual(next.plans.map(p => p.year), [2028, 2027], 'mới nhất trước');
    await app.call('admin', 'PUT', '/test-plan/plans/2028', { sheet: 'Cập nhật 2027', columns: { cycles: { L: 'y3' } } });
    reply = () => new Response(workbook(), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    await app.call('admin', 'PUT', '/test-plan/plans/2028', { url: 'https://docs.google.com/spreadsheets/d/XYZ/edit' });
    const s2028 = (await app.call('admin', 'POST', '/test-plan/plans/2028/sync', {})).body.status;
    assert.deepEqual([s2028.from, s2028.selected], ['link Google Sheet', 5], 'chỉ cột L (và kiểm định AT cột Q)');
    assert.equal(Number((await app.db.queryOne('SELECT COUNT(*) AS n FROM dkct_test_plan_items WHERE year = 2027')).n), 7, 'năm cũ giữ nguyên');

    // phương án năm 2029 (chưa có kế hoạch): dùng kế hoạch gần nhất; trạm khác: không có
    const fallback = (await app.call('lead', 'GET', `/test-plan/items?station=${DN}&year=2029`)).body;
    assert.deepEqual([fallback.year, fallback.years, fallback.items.length], [2028, [2028, 2027], 4]);
    assert.deepEqual((await app.call('lead', 'GET', '/test-plan/items?station=')).body.items, []);

    // đổi năm kế hoạch: thiết bị chuyển theo; trùng năm đã có: báo lỗi
    assert.equal((await app.call('admin', 'PUT', '/test-plan/plans/2028', { year: 2027 })).status, 409);
    const moved = (await app.call('admin', 'PUT', '/test-plan/plans/2028', { year: 2030 })).body;
    assert.deepEqual(moved.plans.map(p => p.year), [2030, 2027]);
    assert.equal(Number((await app.db.queryOne('SELECT COUNT(*) AS n FROM dkct_test_plan_items WHERE year = 2030')).n), 5);

    // xóa kế hoạch năm: xóa cả thiết bị đã đồng bộ
    assert.deepEqual((await app.call('admin', 'DELETE', '/test-plan/plans/2030')).body.plans.map(p => p.year), [2027]);
    assert.equal(Number((await app.db.queryOne('SELECT COUNT(*) AS n FROM dkct_test_plan_items WHERE year = 2030')).n), 0);
    assert.equal((await app.call('admin', 'DELETE', '/test-plan/plans/2030')).status, 404);
  } finally { app.close(); }
});
