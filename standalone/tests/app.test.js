const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { createPgDb } = require('../../server/pgDb');
const { createApp, APP_TABLE_TEXT } = require('../server/app');

// Token giả thay cho Supabase: "h.tok-<id>.s" (dạng JWT) -> người dùng <id>
const IDENTITIES = {
  boss: { id: 'a0', email: 'Boss@Example.com', fullName: 'Quản trị' },
  lan: { id: 'a1', email: 'lan@example.com', fullName: 'Nguyễn Thị Lan' },
  minh: { id: 'a2', email: 'minh@example.com', fullName: 'Trần Minh' }
};

async function startApp({ verifyToken } = {}) {
  const pg = new PGlite({ parsers: { 1114: (v) => v, 20: Number } });
  const { app, migrate } = createApp({
    db: createPgDb(pg, { names: [APP_TABLE_TEXT] }),
    verifyToken: verifyToken || (async (token) => Object.values(IDENTITIES).find(u => `h.tok-${u.id}.s` === token) || null),
    adminEmails: ['boss@example.com'],
    publicConfig: { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon' }
  });
  await migrate();
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (who, method, url, body, extraHeaders = {}) => {
    const headers = { ...(who ? { authorization: `Bearer h.tok-${IDENTITIES[who].id}.s` } : {}), ...extraHeaders };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { call, close: async () => { server.close(); await pg.close(); } };
}

test('chưa đăng nhập hoặc token sai: 401; cấu hình Supabase công khai', async () => {
  const app = await startApp();
  try {
    assert.equal((await app.call(null, 'GET', '/api/app/me')).status, 401);
    assert.equal((await app.call(null, 'GET', '/api/dkct/meta')).status, 401);
    assert.deepEqual((await app.call(null, 'GET', '/api/app/config')).body, { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon' });
  } finally { await app.close(); }
});

test('lần đầu đăng nhập tạo hồ sơ; email trong ADMIN_EMAILS là admin; người thường chờ xếp tổ', async () => {
  const app = await startApp();
  try {
    const boss = (await app.call('boss', 'GET', '/api/app/me')).body.user;
    assert.deepEqual([boss.role, boss.email, boss.fullName], ['admin', 'boss@example.com', 'Quản trị']);
    const lan = (await app.call('lan', 'GET', '/api/app/me')).body.user;
    assert.deepEqual([lan.role, lan.department], ['member', null]);
    // chưa thuộc tổ: chưa xem được dữ liệu nào của module (lịch, bản vẽ, nhân sự…), chờ admin xếp tổ
    for (const url of ['/api/dkct/meta', '/api/dkct/personnel', '/api/dkct/outages', '/api/dkct/substation-drawings']) {
      const r = await app.call('lan', 'GET', url);
      assert.equal(r.status, 403, url);
      assert.match(r.body.error, /chưa được xếp tổ/);
    }
    assert.equal((await app.call('boss', 'GET', '/api/dkct/meta')).status, 200, 'admin chưa có tổ vẫn vào được');
    assert.equal((await app.call('lan', 'GET', '/api/app/users')).status, 403);
  } finally { await app.close(); }
});

test('token không có dạng JWT bị từ chối không gọi Supabase; ADMIN_EMAILS chưa xác nhận email thì không là admin', async () => {
  let calls = 0;
  const app = await startApp({
    verifyToken: async (token) => { calls += 1; return token === 'h.x.s' ? { id: 'u9', email: 'boss@example.com', fullName: '', emailConfirmed: false } : null; }
  });
  try {
    assert.equal((await app.call(null, 'GET', '/api/app/me', undefined, { authorization: 'Bearer khong-phai-jwt' })).status, 401);
    assert.equal(calls, 0);
    for (let i = 0; i < 3; i++) assert.equal((await app.call(null, 'GET', '/api/app/me', undefined, { authorization: 'Bearer a.b.c' })).status, 401);
    assert.equal(calls, 1, 'token sai được nhớ, không hỏi lại Supabase');
    const me = (await app.call(null, 'GET', '/api/app/me', undefined, { authorization: 'Bearer h.x.s' })).body.user;
    assert.equal(me.role, 'member');
  } finally { await app.close(); }
});

test('admin tạo tổ, xếp tổ và cấp trưởng tổ; số giấy dùng tên viết tắt của tổ', async () => {
  const app = await startApp();
  try {
    await app.call('lan', 'GET', '/api/app/me');
    await app.call('minh', 'GET', '/api/app/me');
    const T = 'Tổ Thí nghiệm khu vực';
    assert.equal((await app.call('lan', 'POST', '/api/app/departments', { name: T, shortName: 'TNKH' })).status, 403);
    assert.equal((await app.call('boss', 'POST', '/api/app/departments', { name: T, shortName: 'TNKH' })).status, 201);
    assert.equal((await app.call('boss', 'POST', '/api/app/departments', { name: T, shortName: 'X' })).status, 409);
    assert.equal((await app.call('boss', 'PUT', '/api/app/users/a1', { department: T, role: 'lead' })).status, 200);
    assert.equal((await app.call('boss', 'PUT', '/api/app/users/a2', { department: T })).status, 200);
    assert.equal((await app.call('boss', 'PUT', '/api/app/users/a2', { department: 'Không có' })).status, 400);
    assert.equal((await app.call('boss', 'PUT', '/api/app/users/a0', { role: 'member' })).status, 400, 'không tự bỏ quyền admin');

    const lead = (await app.call('lan', 'GET', '/api/dkct/meta')).body;
    assert.equal(lead.permissions.canCreate, true);
    assert.match(lead.numbering.preview, /^1\/ĐK-TNKH$/);
    assert.deepEqual(lead.departments, [{ name: T, shortName: 'TNKH' }]);
    assert.equal((await app.call('minh', 'GET', '/api/dkct/meta')).body.permissions.canCreate, false);

    // tổ còn thành viên thì không xóa được
    assert.equal((await app.call('boss', 'DELETE', `/api/app/departments/${encodeURIComponent(T)}`)).status, 409);
    const users = (await app.call('boss', 'GET', '/api/app/users')).body.items;
    assert.deepEqual(users.map(u => [u.email, u.department, u.role]).sort(), [
      ['boss@example.com', null, 'admin'], ['lan@example.com', T, 'lead'], ['minh@example.com', T, 'member']
    ].sort());
  } finally { await app.close(); }
});

test('hồ sơ cá nhân: sửa tên, chức danh, điện thoại; dùng cho "người đại diện" trên giấy', async () => {
  const app = await startApp();
  try {
    await app.call('boss', 'POST', '/api/app/departments', { name: 'Tổ A', shortName: 'A' });
    await app.call('lan', 'GET', '/api/app/me');
    await app.call('boss', 'PUT', '/api/app/users/a1', { department: 'Tổ A', role: 'lead' });
    const saved = (await app.call('lan', 'PUT', '/api/app/me', { fullName: ' Nguyễn Thị Lan ', position: 'Tổ trưởng', phone: '0909' })).body.user;
    assert.deepEqual([saved.fullName, saved.position, saved.phone], ['Nguyễn Thị Lan', 'Tổ trưởng', '0909']);
    const rep = (await app.call('lan', 'GET', '/api/dkct/meta')).body.defaults.representative;
    assert.deepEqual([rep.name, rep.role, rep.contact], ['Nguyễn Thị Lan', 'Tổ trưởng', '0909 (lan@example.com)']);
  } finally { await app.close(); }
});
