// Gắn module vào ứng dụng khác (ChatLan-cloud) dùng chung CSDL, tài khoản với bản độc lập
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const XLSX = require('xlsx');
const { PGlite } = require('@electric-sql/pglite');
const { createPgDb } = require('../server/pgDb');
const { APP_TABLE_TEXT } = require('../server/accounts');
const { createSharedDkct } = require('../server/shared');

const HEADER = ['Thời gian bắt đầu', 'Thời gian kết thúc', 'Địa điểm', 'Nội dung', 'Phạm vi', 'Đơn vị đăng ký', 'Đơn vị công tác', 'Tình trạng đăng ký'];
const excelFrom = (rows, range) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['LỊCH CẮT ĐIỆN'], [], HEADER, ...rows]), 'Sheet1');
  const f = new FormData();
  f.append('file', new Blob([XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })]), 'lich.xlsx');
  if (range) { f.append('compareFrom', range[0]); f.append('compareTo', range[1]); }
  return f;
};
const TEAM = 'Tổ TN Lâm Đồng';
// người dùng của ứng dụng chủ (id riêng của ChatLan) -> email
const HOST_USERS = { c1: 'Lead@Example.com', c2: 'member@example.com', c3: 'stranger@example.com', c4: 'pending@example.com' };

async function start() {
  const pg = new PGlite({ parsers: { 1114: (v) => v, 20: Number } });
  const db = createPgDb(pg, { names: [APP_TABLE_TEXT] });
  const sent = [];
  const shared = createSharedDkct({
    db,
    emailOf: async (id) => HOST_USERS[id] || '',
    notifyByEmail: async (messages) => { sent.push(...messages); },
    standaloneUrl: 'https://dkct.onrender.com',
    log: { warn: () => {}, info: () => {} }
  });
  await shared.migrate();
  // tài khoản do bản độc lập tạo (đăng nhập Supabase), admin đã xếp tổ
  await db.execute('INSERT INTO dkct_app_departments (name, shortName) VALUES (?, ?)', [TEAM, 'TNLĐ']);
  for (const [id, email, role, dept] of [['sb-lead', 'lead@example.com', 'lead', TEAM], ['sb-mem', 'member@example.com', 'member', TEAM], ['sb-pending', 'pending@example.com', 'member', null]]) {
    await db.execute('INSERT INTO dkct_app_users (id, email, fullName, role, department) VALUES (?, ?, ?, ?, ?)', [id, email, id, role, dept]);
  }
  const app = express();
  app.use('/api/dkct', (req, res, next) => { req.userId = req.headers['x-host-user']; next(); }, shared.router);
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/dkct`;
  const call = async (who, method, url, body) => {
    const init = { method, headers: { 'x-host-user': who } };
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
    const res = await fetch(base + url, init);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { db, shared, call, sent, close: async () => { shared.stop(); server.close(); await pg.close(); } };
}

test('người dùng ứng dụng chủ dùng đúng tài khoản dkct cùng email; chưa có tài khoản / chưa xếp tổ thì 403 kèm mã', async () => {
  const t = await start();
  try {
    const st = (await t.call('c1', 'GET', '/link-status')).body;
    assert.deepEqual([st.email, st.linked, st.ready, st.user.department, st.user.role], ['lead@example.com', true, true, TEAM, 'lead']);
    assert.deepEqual((await t.call('c3', 'GET', '/link-status')).body.linked, false);
    assert.equal((await t.call('c4', 'GET', '/link-status')).body.ready, false);

    const no = await t.call('c3', 'GET', '/meta');
    assert.deepEqual([no.status, no.body.code], [403, 'DKCT_NOT_LINKED']);
    assert.match(no.body.error, /stranger@example\.com.*dkct\.onrender\.com/);
    assert.equal((await t.call('c4', 'GET', '/meta')).body.code, 'DKCT_NO_TEAM');

    const meta = (await t.call('c1', 'GET', '/meta')).body;
    assert.equal(meta.permissions.canCreate, true, 'trưởng tổ (vai trò ở bảng dkct_app_users)');
    assert.equal((await t.call('c2', 'GET', '/meta')).body.permissions.canCreate, false);

    // công việc lập từ ứng dụng chủ ghi người lập là tài khoản dkct (cùng dữ liệu với bản độc lập)
    const draft = (await t.call('c1', 'GET', '/work-defaults')).body.draft;
    const made = await t.call('c1', 'POST', '/works', { ...draft, content: 'Kiểm tra định kỳ', stationName: 'TBA 220kV Phan Thiết' });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const row = await t.db.queryOne('SELECT createdBy, department FROM dkct_works WHERE id = ?', [made.body.work.id]);
    assert.deepEqual([row.createdBy, row.department], ['sb-lead', TEAM]);
  } finally { await t.close(); }
});

test('báo lịch thay đổi qua ứng dụng chủ: đọc lịch sử (kể cả do bản độc lập tải), gửi theo email, không gửi lặp', async () => {
  const t = await start();
  const now = new Date('2024-10-05T03:00:00Z');
  try {
    await t.call('c1', 'PUT', '/team-areas', { department: TEAM, areas: ['TTĐ Lâm Đồng'] }); // không phải admin: bỏ qua
    await t.db.execute('INSERT INTO dkct_app_users (id, email, role) VALUES (?, ?, ?)', ['sb-admin', 'boss@example.com', 'admin']);
    HOST_USERS.c9 = 'boss@example.com';
    assert.equal((await t.call('c9', 'PUT', '/team-areas', { department: TEAM, areas: ['Truyền tải điện Lâm Đồng'] })).status, 200);

    assert.equal(await t.shared.pollChanges(now), 0, 'lần đầu: chỉ đánh dấu');
    const A = ['05/10/2024 07h00', '05/10/2024 17h00', 'Trạm 220kV Phan Thiết', 'Thí nghiệm MC 272', '', 'TTĐ Lâm Đồng', '', ''];
    await t.call('c1', 'POST', '/outages/import/commit', excelFrom([A]));
    await t.shared.pollChanges(now); // lần nạp đầu không có so sánh -> không có thay đổi
    // nạp lại: dòng bị hoãn -> trưởng tổ phụ trách khu vực nhận tin (qua email)
    await t.call('c1', 'POST', '/outages/import/commit', excelFrom([A.slice(0, 7).concat('Hoãn')], ['2024-10-05', '2024-10-05']));
    assert.equal(await t.shared.pollChanges(now), 1);
    assert.deepEqual(t.sent.map(m => m.email), ['lead@example.com']);
    assert.match(t.sent[0].text, /⚡ Lịch cắt điện thay đổi \(lich\.xlsx\):\n• Hoãn: 05\/10 07:00 Trạm 220kV Phan Thiết/);
    assert.equal(await t.shared.pollChanges(now), 0, 'không gửi lặp');
    // thay đổi quá 2 ngày (máy chủ ngủ lâu) thì bỏ qua
    await t.call('c1', 'POST', '/outages/import/commit', excelFrom([A], ['2024-10-05', '2024-10-05']));
    assert.equal(await t.shared.pollChanges(new Date(Date.now() + 3 * 86400000)), 0);
  } finally { await t.close(); }
});
