const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { startApp, USERS } = require('./helpers/app');
const { parseTimes, autoConfig } = require('../server/services/outageAutoFetch');
const { areaKey, areasInUnits } = require('../server/services/outageArea');

const HEADER = ['Thời gian bắt đầu', 'Thời gian kết thúc', 'Địa điểm', 'Nội dung', 'Phạm vi', 'Đơn vị đăng ký', 'Đơn vị công tác', 'Tình trạng đăng ký'];
const xlsx = (rows) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['LỊCH CẮT ĐIỆN'], [], HEADER, ...rows]), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};
const excelFrom = (rows, range) => {
  const f = new FormData();
  f.append('file', new Blob([xlsx(rows)]), 'lich.xlsx');
  if (range) { f.append('compareFrom', range[0]); f.append('compareTo', range[1]); }
  return f;
};
const LD = USERS.lead.department; // Tổ Thí nghiệm điện Lâm Đồng

test('areaKey / areasInUnits: TTĐ viết tắt hay đầy đủ, có dấu hay không; bỏ đơn vị không phải TTĐ', () => {
  assert.equal(areaKey('Truyền tải điện Đắk Lắk'), 'dak lak');
  assert.equal(areaKey('TTĐ Đắk lăk.'), 'dak lak');
  assert.deepEqual([...areasInUnits('TTĐ Lâm Đồng,Đội SCTNĐ3', 'TTĐ Khánh Hòa; TTĐ Đắk Lăk')].sort(), ['dak lak', 'khanh hoa', 'lam dong']);
  assert.deepEqual([...areasInUnits('CPMB, Đ3', 'Đội SCTN3')], []);
});

test('parseTimes / autoConfig: giờ hẹn hợp lệ, sắp xếp; số ngày trong giới hạn', () => {
  assert.deepEqual(parseTimes('15:00, 7:00;7h30 25:00 abc'), ['07:00', '07:30', '15:00']);
  assert.deepEqual(parseTimes(''), []);
  assert.deepEqual(autoConfig({ times: '07:00', days: '999' }), { times: ['07:00'], days: 62 });
  assert.equal(autoConfig({ times: '', days: undefined }).days, 14);
});

test('khu vực của tổ: admin đặt; "của tổ tôi" = thuộc khu vực (đơn vị TTĐ hoặc TBA trong danh mục) hoặc tổ đã lập hồ sơ', async () => {
  const app = await startApp();
  try {
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([
      ['05/10/2024 07h00', '05/10/2024 17h00', 'TBA 220kV Ninh Sơn', 'Việc 1', '', 'TTĐ Lâm Đồng', 'TTĐ Lâm Đồng, Đội SCTN3', ''],
      ['06/10/2024 07h00', '06/10/2024 17h00', 'TBA 220kV Nha Trang', 'Việc 2', '', 'TTĐ Khánh Hòa', 'TTĐ Khánh Hòa', ''],
      ['07/10/2024 07h00', '07/10/2024 17h00', 'TBA 500kV Di Linh', 'Việc 3', '', 'Đ1', 'Đội SCTN3', ''],
      ['08/10/2024 07h00', '08/10/2024 17h00', 'TBA 220kV Pleiku', 'Việc 4', '', 'TTĐ Gia Lai', 'TTĐ Gia Lai', '']
    ]));
    const mineOf = async (user) => Object.fromEntries((await app.call(user, 'GET', '/outages?from=2024-10-01')).body.items.map(o => [o.content, o.mine]));
    assert.deepEqual(await mineOf('lead'), { 'Việc 1': false, 'Việc 2': false, 'Việc 3': false, 'Việc 4': false }, 'chưa đặt khu vực, chưa có hồ sơ');

    const opts = (await app.call('lead', 'GET', '/team-areas')).body;
    for (const a of ['Truyền tải điện Lâm Đồng', 'Truyền tải điện Khánh Hòa', 'Truyền tải điện Gia Lai']) assert.ok(opts.options.includes(a), a);
    assert.ok(opts.teams.some(t => t.department === LD));
    assert.equal((await app.call('lead', 'PUT', '/team-areas', { department: LD, areas: ['Truyền tải điện Lâm Đồng'] })).status, 403, 'chỉ admin');
    const put = await app.call('admin', 'PUT', '/team-areas', { department: LD, areas: ['Truyền tải điện Lâm Đồng', 'TTĐ Lâm Đồng', ''] });
    assert.deepEqual(put.body.areas, ['TTĐ Lâm Đồng'], 'bỏ trùng khu vực (cùng tên sau chuẩn hóa), bỏ ô trống');

    // Việc 4 (Gia Lai) có biên bản KSHT của tổ -> của tổ
    const { SURVEY } = require('./fixtures/sampleSurvey');
    const items = (await app.call('lead', 'GET', '/outages?from=2024-10-01')).body.items;
    await app.call('lead', 'POST', '/surveys', { ...SURVEY, outageId: items.find(o => o.content === 'Việc 4').id });
    const res = (await app.call('lead', 'GET', '/outages?from=2024-10-01')).body;
    assert.deepEqual(res.myAreas, ['TTĐ Lâm Đồng']);
    assert.deepEqual(Object.fromEntries(res.items.map(o => [o.content, o.mine])),
      { 'Việc 1': true, 'Việc 2': false, 'Việc 3': true, 'Việc 4': true }, 'Việc 3: TBA Di Linh thuộc TTĐ Lâm Đồng trong danh mục');
    assert.deepEqual(await mineOf('other'), { 'Việc 1': false, 'Việc 2': false, 'Việc 3': false, 'Việc 4': false }, 'tổ khác chưa đặt khu vực');
  } finally { app.close(); }
});

test('báo thay đổi lịch: người lập + tổ trưởng của hồ sơ gắn dòng lịch; tổ trưởng của khu vực; không báo lặp', async () => {
  const sent = [];
  const app = await startApp({
    notifyUsers: async (msgs) => { sent.push(...msgs); },
    listTeamLeads: async (dept) => (dept === LD ? [USERS.lead.id] : [])
  });
  try {
    await app.call('admin', 'PUT', '/team-areas', { department: LD, areas: ['Truyền tải điện Lâm Đồng'] });
    const A = ['05/10/2024 07h00', '05/10/2024 17h00', 'TBA 220kV Ninh Sơn', 'Thí nghiệm định kỳ MBA T1', '', 'TTĐ Lâm Đồng', 'TTĐ Lâm Đồng', ''];
    const K = ['06/10/2024 07h00', '06/10/2024 17h00', 'TBA 220kV Nha Trang', 'Sửa chữa DCL 271-1', '', 'TTĐ Khánh Hòa', 'TTĐ Khánh Hòa', ''];
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([A, K]));
    assert.equal(sent.length, 0, 'lần nạp đầu không so sánh, không báo');
    const k = (await app.call('lead', 'GET', '/outages?from=2024-10-01')).body.items.find(o => o.location === 'TBA 220kV Nha Trang');
    const { PLAN } = require('./fixtures/samplePlan');
    // tổ khác (admin, Ban giám đốc) lập phương án; tổ Lâm Đồng lập biên bản KSHT — cùng gắn dòng lịch Khánh Hòa
    const plan = (await app.call('admin', 'POST', '/plans', { ...PLAN, outageId: k.id })).body.plan;
    const { SURVEY } = require('./fixtures/sampleSurvey');
    assert.ok((await app.call('lead', 'POST', '/surveys', { ...SURVEY, outageId: k.id })).body.survey);

    // lịch mới: A dời ngày, K không còn (hoãn), N phát sinh ở Lâm Đồng
    const N = ['07/10/2024 07h00', '07/10/2024 11h00', 'TBA 110kV Bảo Lộc', 'Vệ sinh sứ 171', '', 'TTĐ Lâm Đồng', 'TTĐ Lâm Đồng', ''];
    const next = [['08/10/2024 07h00', '08/10/2024 17h00', ...A.slice(2)], N];
    const res = (await app.call('lead', 'POST', '/outages/import/commit', excelFrom(next, ['2024-10-05', '2024-10-08']))).body;
    assert.equal(res.notified, 2);
    const to = Object.fromEntries(sent.map(m => [m.userId, m.text]));
    assert.deepEqual(Object.keys(to).sort(), [USERS.lead.id, USERS.admin.id].sort());
    // người lập phương án (tổ khác): chỉ dòng hoãn gắn hồ sơ của mình, chỉ thấy hồ sơ của tổ mình
    assert.match(to[USERS.admin.id], /Hoãn: 06\/10 07:00 TBA 220kV Nha Trang/);
    assert.ok(to[USERS.admin.id].includes(`Hồ sơ liên quan: Phương án ${plan.docNumber}`));
    assert.doesNotMatch(to[USERS.admin.id], /Dời lịch|Phát sinh|Biên bản KSHT/);
    // tổ trưởng: hoãn (biên bản của tổ), dời + phát sinh (khu vực Lâm Đồng)
    assert.match(to[USERS.lead.id], /Hoãn: 06\/10[\s\S]*Hồ sơ liên quan: Biên bản KSHT/);
    assert.doesNotMatch(to[USERS.lead.id], /Phương án/);
    assert.match(to[USERS.lead.id], /Dời lịch: 08\/10 07:00 TBA 220kV Ninh Sơn[\s\S]*Dời lịch: 05\/10 07:00–17:00 → 08\/10 07:00–17:00/);
    assert.match(to[USERS.lead.id], /Phát sinh: 07\/10 07:00 TBA 110kV Bảo Lộc/);

    // tải lại y như vậy: không ghi thay đổi, không báo lại
    sent.length = 0;
    const again = (await app.call('lead', 'POST', '/outages/import/commit', excelFrom(next, ['2024-10-05', '2024-10-08']))).body;
    assert.deepEqual([again.logged, again.notified, sent.length], [0, 0, 0]);
  } finally { app.close(); }
});

test('báo thay đổi lỗi (vd mất kết nối chat) không làm hỏng việc nạp lịch', async () => {
  const app = await startApp({ notifyUsers: async () => { throw new Error('chat lỗi'); }, listTeamLeads: async () => [USERS.lead.id] });
  const warn = console.warn;
  console.warn = () => {};
  try {
    await app.call('admin', 'PUT', '/team-areas', { department: LD, areas: ['Truyền tải điện Lâm Đồng'] });
    const A = ['05/10/2024 07h00', '05/10/2024 17h00', 'TBA 220kV Ninh Sơn', 'Việc A', '', 'TTĐ Lâm Đồng', '', ''];
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([A]));
    const res = await app.call('lead', 'POST', '/outages/import/commit', excelFrom([A, ['05/10/2024 13h00', '05/10/2024 17h00', 'TBA 220kV Ninh Sơn', 'Việc B', '', 'TTĐ Lâm Đồng', '', '']], ['2024-10-05', '2024-10-05']));
    assert.equal(res.status, 200);
    assert.deepEqual([res.body.inserted, res.body.logged, res.body.notified], [1, 1, 0]);
  } finally { console.warn = warn; app.close(); }
});

test('tự tải theo giờ hẹn: đúng giờ VN thì tải hôm nay..+N ngày, mỗi slot một lần; lỗi trang được ghi nhật ký', async () => {
  const posts = [];
  let deny = false;
  const fakeFetch = async (url, init) => {
    if (deny) return new Response('no', { status: 401 });
    if (init.method === 'GET') {
      return new Response('<input type="hidden" name="__VIEWSTATE" value="vs" /><input name="txtTuNgay" />', { headers: { 'content-type': 'text/html' } });
    }
    posts.push(new URLSearchParams(String(init.body)));
    return new Response(xlsx([['05/10/2024 07h00', '05/10/2024 17h00', 'Trạm A', 'Việc A', '', 'TTĐ Lâm Đồng', '', '']]),
      { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
  };
  const app = await startApp({ outageSource: { url: 'https://lich.test/lcd.aspx', user: 'u', password: 'p', fetch: fakeFetch }, outageAuto: { times: '07:00,15:00', days: 3 } });
  const info = console.info;
  const warn = console.warn;
  console.info = () => {};
  console.warn = () => {};
  try {
    const auto = app.dkct.autoFetch;
    assert.equal(await auto.enabled(), true);
    const at = (iso) => new Date(iso); // giờ UTC; VN = UTC+7
    const first = await auto.tick(at('2024-10-05T00:00:30Z')); // 07:00 VN
    assert.equal(first.rows, 1);
    assert.deepEqual([posts[0].get('txtTuNgay'), posts[0].get('txtDenNgay')], ['05/10/2024', '07/10/2024']);
    assert.equal(await auto.tick(at('2024-10-05T00:00:50Z')), null, 'cùng slot 07:00 không tải lại');
    assert.equal(await auto.tick(at('2024-10-05T00:01:10Z')), null, '07:01 không phải giờ hẹn');
    const second = await auto.tick(at('2024-10-05T08:00:00Z')); // 15:00 VN
    assert.equal(second.compare.unchanged, 1, 'lần sau so với lịch đã tải');
    deny = true;
    assert.equal(await auto.tick(at('2024-10-06T00:00:00Z')), null);

    const src = (await app.call('member', 'GET', '/outages/source')).body;
    assert.deepEqual(src.auto, { times: ['07:00', '15:00'], days: 3 });
    assert.deepEqual(src.runs.map(r => [r.mode, r.ok]), [['AUTO', false], ['AUTO', true], ['AUTO', true]]);
    assert.match(src.runs[0].error, /từ chối tài khoản/);
    const items = (await app.call('member', 'GET', '/outages?from=2024-10-01')).body.items;
    assert.match(items[0].sourceFile, /^Tự tải 07:00 05\/10\/2024/);
  } finally { console.info = info; console.warn = warn; app.close(); }
});

test('dấu phát sinh / dời / sửa hết hạn sau 7 ngày; dấu hoãn giữ đến khi có lại', async () => {
  const app = await startApp();
  try {
    const A = ['05/10/2024 07h00', '05/10/2024 17h00', 'Trạm A', 'Việc A', '', '', '', ''];
    const B = ['06/10/2024 07h00', '06/10/2024 17h00', 'Trạm B', 'Việc B', '', '', '', ''];
    const C = ['07/10/2024 07h00', '07/10/2024 17h00', 'Trạm C', 'Việc C', '', '', '', ''];
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([A, B]));
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([A, C], ['2024-10-05', '2024-10-07']));
    const kinds = async () => Object.fromEntries((await app.call('lead', 'GET', '/outages?from=2024-10-01')).body.items.map(o => [o.location, o.changeKind || null]));
    assert.deepEqual(await kinds(), { 'Trạm A': null, 'Trạm B': 'POSTPONED', 'Trạm C': 'NEW' });
    const { createOutageImporter } = require('../server/services/outageImport');
    await createOutageImporter({ db: app.db }).expireMarks(new Date(Date.now() + 8 * 86400000), { force: true });
    assert.deepEqual(await kinds(), { 'Trạm A': null, 'Trạm B': 'POSTPONED', 'Trạm C': null });
  } finally { app.close(); }
});

test('dọn lịch cũ theo khoảng ngày: chỉ admin; xem trước số dòng; giữ dòng đã có hồ sơ gắn; xóa cả lịch sử', async () => {
  const app = await startApp();
  try {
    const row = (d, loc) => [`${d}/10/2024 07h00`, `${d}/10/2024 17h00`, loc, `Việc ${loc}`, '', '', '', ''];
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([row('01', 'A'), row('02', 'B')]));
    // nạp lại có thay đổi để có lịch sử: B không còn (hoãn), C phát sinh
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([row('01', 'A'), row('03', 'C'), row('20', 'Z')], ['2024-10-01', '2024-10-03']));
    const items = (await app.call('lead', 'GET', '/outages?from=2024-09-01')).body.items;
    const id = (loc) => items.find(o => o.location === loc).id;
    const { SURVEY } = require('./fixtures/sampleSurvey');
    await app.call('lead', 'POST', '/surveys', { ...SURVEY, outageId: id('A') }); // A có biên bản: giữ lại

    assert.equal((await app.call('lead', 'GET', '/outages/purge/preview?to=2024-10-05')).status, 403, 'chỉ admin');
    assert.equal((await app.call('admin', 'GET', '/outages/purge/preview?from=2024-10-09&to=2024-10-05')).status, 400);
    assert.equal((await app.call('admin', 'GET', '/outages/purge/preview')).status, 400, 'phải có đến ngày');
    const pv = (await app.call('admin', 'GET', '/outages/purge/preview?to=2024-10-05')).body;
    assert.deepEqual([pv.total, pv.linked, pv.deletable], [3, 1, 2]);
    assert.equal((await app.call('lead', 'GET', '/outages?from=2024-09-01')).body.items.length, 4, 'xem trước không xóa gì');

    assert.equal((await app.call('lead', 'POST', '/outages/purge', { to: '2024-10-05' })).status, 403);
    const res = (await app.call('admin', 'POST', '/outages/purge', { to: '2024-10-05' })).body;
    assert.deepEqual([res.deleted, res.kept], [2, 1]);
    const left = (await app.call('lead', 'GET', '/outages?from=2024-09-01')).body.items.map(o => o.location);
    assert.deepEqual(left, ['A', 'Z'], 'giữ dòng có biên bản và dòng ngoài khoảng');
    const hist = await app.db.query('SELECT outageId FROM dkct_outage_changes');
    assert.ok(hist.every(h => [id('A'), id('Z')].includes(h.outageId)), 'lịch sử của dòng đã xóa cũng xóa');
    // khoảng có từ ngày
    const r2 = (await app.call('admin', 'POST', '/outages/purge', { from: '2024-10-15', to: '2024-10-31' })).body;
    assert.deepEqual([r2.deleted, r2.kept], [1, 0]);
  } finally { app.close(); }
});

test('cấu hình tải lịch do admin đặt: chỉ admin; mật khẩu mã hóa, không trả về; giờ tải có hiệu lực ngay; bỏ trống = dùng .env', async () => {
  const auths = [];
  const fakeFetch = async (url, init) => {
    const auth = Buffer.from(init.headers.Authorization.slice(6), 'base64').toString();
    if (init.method === 'GET') {
      auths.push(auth);
      if (auth !== 'tnld2:mat-khau-moi' && auth !== 'u:p') return new Response('no', { status: 401 });
      return new Response('<input type="hidden" name="__VIEWSTATE" value="vs" /><input name="txtTuNgay" />', { headers: { 'content-type': 'text/html' } });
    }
    return new Response(xlsx([['05/10/2024 07h00', '05/10/2024 17h00', 'Trạm A', 'Việc A', '', '', '', '']]),
      { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
  };
  const app = await startApp({
    outageSource: { url: 'https://lich.test/lcd.aspx', user: 'u', password: 'p', fetch: fakeFetch },
    outageAuto: { times: '07:00', days: 3 }, secretKey: 'khoa-thu'
  });
  const info = console.info;
  console.info = () => {};
  try {
    for (const who of ['member', 'lead']) {
      assert.equal((await app.call(who, 'GET', '/outage-settings')).status, 403);
      assert.equal((await app.call(who, 'PUT', '/outage-settings', { times: '08:00' })).status, 403);
    }
    let view = (await app.call('admin', 'GET', '/outage-settings')).body;
    assert.deepEqual([view.user, view.defaultUser, view.passwordFrom, view.autoFrom, view.times, view.days, view.canStorePassword],
      ['', 'u', 'env', 'env', '07:00', 3, true]);

    view = (await app.call('admin', 'PUT', '/outage-settings', { user: 'tnld2', password: 'mat-khau-moi', times: '7h30; 15:00', days: 5 })).body;
    assert.deepEqual([view.user, view.passwordFrom, view.autoFrom, view.times, view.days], ['tnld2', 'admin', 'admin', '07:30, 15:00', 5]);
    assert.ok(!JSON.stringify(view).includes('mat-khau-moi'), 'không trả mật khẩu về trình duyệt');
    const raw = (await app.db.queryOne("SELECT value FROM dkct_settings WHERE name = 'outage.config'")).value;
    assert.ok(!raw.includes('mat-khau-moi') && /"password":"v1:/.test(raw), 'mật khẩu lưu dạng mã hóa');

    assert.equal((await app.call('admin', 'POST', '/outage-settings/test')).body.ok, true);
    assert.equal(auths.at(-1), 'tnld2:mat-khau-moi', 'dùng tài khoản admin vừa lưu');
    assert.deepEqual((await app.call('member', 'GET', '/outages/source')).body.auto, { times: ['07:30', '15:00'], days: 5 });
    assert.equal(await app.dkct.autoFetch.tick(new Date('2024-10-05T00:00:00Z')), null, '07:00 không còn là giờ hẹn');
    assert.equal((await app.dkct.autoFetch.tick(new Date('2024-10-05T00:30:00Z'))).rows, 1, '07:30 tải ngay, không cần khởi động lại');

    // giữ mật khẩu khi để trống; lỗi nhập
    view = (await app.call('admin', 'PUT', '/outage-settings', { user: 'tnld2', password: '' })).body;
    assert.equal(view.passwordFrom, 'admin');
    assert.equal((await app.call('admin', 'PUT', '/outage-settings', { times: 'sáng sớm' })).status, 400);
    assert.equal((await app.call('admin', 'PUT', '/outage-settings', { days: 100 })).status, 400);

    // để trống giờ = tắt tự tải; "dùng .env" quay về mặc định
    await app.call('admin', 'PUT', '/outage-settings', { times: '' });
    assert.equal((await app.call('member', 'GET', '/outages/source')).body.auto, null);
    view = (await app.call('admin', 'PUT', '/outage-settings', { user: '', clearPassword: true, resetAuto: true })).body;
    assert.deepEqual([view.user, view.passwordFrom, view.autoFrom, view.times], ['', 'env', 'env', '07:00']);
    await app.call('admin', 'POST', '/outage-settings/test');
    assert.equal(auths.at(-1), 'u:p');

    // sai tài khoản: báo lỗi của trang lịch (424)
    await app.call('admin', 'PUT', '/outage-settings', { user: 'sai', password: 'sai' });
    const bad = await app.call('admin', 'POST', '/outage-settings/test');
    assert.equal(bad.status, 424);
    assert.match(bad.body.error, /từ chối tài khoản/);
  } finally { console.info = info; app.close(); }
});

test('cấu hình tải lịch: máy chủ không có khóa thì không lưu mật khẩu; đổi khóa thì mật khẩu cũ báo không đọc được', async () => {
  const { createOutageSettings, encrypt, decrypt } = require('../server/services/outageSettings');
  assert.equal(decrypt('khoa-b', encrypt('khoa-a', 'x')), null);
  assert.equal(decrypt('khoa-a', encrypt('khoa-a', 'mật khẩu')), 'mật khẩu');
  const app = await startApp();
  try {
    const noKey = createOutageSettings({ db: app.db, secret: '', source: { user: '', password: '' } });
    await assert.rejects(noKey.save({ password: 'abc' }), /DKCT_SECRET_KEY/);
    await noKey.save({ user: 'tnld' });
    assert.equal((await noKey.view()).canStorePassword, false);
    const a = createOutageSettings({ db: app.db, secret: 'khoa-a', source: { user: '', password: '' } });
    await a.save({ password: 'abc' });
    const b = createOutageSettings({ db: app.db, secret: 'khoa-b', source: { user: '', password: '' } });
    const view = await b.view();
    assert.deepEqual([view.passwordUnreadable, view.passwordFrom], [true, '']);
    assert.equal((await b.sourceOptions()).password, '', 'không giải mã được thì không dùng');
  } finally { app.close(); }
});
