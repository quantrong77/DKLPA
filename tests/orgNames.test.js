const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp, USERS } = require('./helpers/app');
const { createAccounts } = require('../server/accounts');
const { renameDepartment } = require('../server/services/departmentRename');

const LD = USERS.lead.department;

test('Tên đơn vị: admin đặt tên công ty, đội; văn bản lập mới dùng tên mới; để trống thì như trước', async () => {
  const app = await startApp();
  try {
    const before = (await app.call('lead', 'GET', '/org-names')).body;
    assert.deepEqual([before.companyName, before.unitName], ['', '']);
    assert.equal(before.defaults.unitName, 'Đội Sửa chữa, thí nghiệm điện 3');
    assert.equal((await app.call('lead', 'GET', '/meta')).body.defaults.header.unitName, 'Đội Sửa chữa, thí nghiệm điện 3');

    assert.equal((await app.call('lead', 'PUT', '/org-names', { unitName: 'Đội mới' })).status, 403);
    const saved = (await app.call('admin', 'PUT', '/org-names', { companyName: '  Công ty  Truyền tải điện 3 mới ', unitName: 'Đội Thí nghiệm điện 3' })).body;
    assert.deepEqual([saved.companyName, saved.unitName], ['Công ty Truyền tải điện 3 mới', 'Đội Thí nghiệm điện 3']);

    assert.equal((await app.call('lead', 'GET', '/meta')).body.defaults.header.unitName, 'Đội Thí nghiệm điện 3', 'giấy ĐKCT');
    assert.equal((await app.call('lead', 'GET', '/survey-defaults')).body.draft.header.unitName, 'Đội Thí nghiệm điện 3', 'biên bản KSHT');
    const plan = (await app.call('lead', 'GET', '/plan-defaults')).body.draft.header;
    assert.deepEqual([plan.companyName, plan.unitName], ['Công ty Truyền tải điện 3 mới', 'Đội Thí nghiệm điện 3'], 'phương án');
    const conf = (await app.call('lead', 'GET', '/confirmation-defaults')).body.draft.header;
    assert.deepEqual([conf.companyName, conf.unitName], ['Công ty Truyền tải điện 3 mới', 'Đội Thí nghiệm điện 3'], 'giấy xác nhận');

    // để trống: lại như trước (văn bản gần nhất của tổ / mặc định)
    await app.call('admin', 'PUT', '/org-names', { companyName: '', unitName: '' });
    assert.equal((await app.call('lead', 'GET', '/plan-defaults')).body.draft.header.unitName, 'Đội Sửa chữa, thí nghiệm điện 3');
  } finally { app.close(); }
});

test('đổi tên tổ: không gộp vào tên còn dữ liệu cũ; lỗi giữa chừng thì gọi lại để làm nốt', async () => {
  const app = await startApp();
  try {
    await createAccounts(app.db).migrate();
    await app.db.execute('INSERT INTO dkct_app_departments (name, shortName, sortOrder) VALUES (?, ?, 1)', [LD, 'TNLĐ']);
    await app.db.execute("INSERT INTO dkct_app_users (id, email, fullName, role, department) VALUES ('u1', 'a@x.vn', 'A', 'lead', ?)", [LD]);
    await app.db.execute("INSERT INTO dkct_team_areas (id, department, area) VALUES ('ta1', ?, 'Truyền tải điện Lâm Đồng')", [LD]);
    await app.db.execute("INSERT INTO dkct_counters (department, year, lastNumber) VALUES (?, 2026, 7), (?, 2026, 3)", [LD, `PA:${LD}`]);

    // tên mới còn dữ liệu của tổ cũ trùng tên (đã xóa khỏi danh sách tổ): không gộp
    await app.db.execute("INSERT INTO dkct_counters (department, year, lastNumber) VALUES ('GXN:Tổ Cũ', 2025, 2)");
    await assert.rejects(renameDepartment(app.db, { from: LD, to: 'Tổ Cũ' }), { status: 409 });
    await assert.rejects(renameDepartment(app.db, { from: LD, to: LD }), { status: 400 });
    await assert.rejects(renameDepartment(app.db, { from: 'Không có', to: 'X' }), { status: 404 });

    // lỗi giữa chừng (mất kết nối khi đổi bảng thứ 3): danh sách tổ còn tên cũ, đánh dấu đang đổi; gọi lại thì xong
    const NEW = 'Tổ Thí nghiệm khu vực Lâm Đồng';
    let calls = 0;
    const flaky = { ...app.db, execute: (sql, p) => { if (/^UPDATE dkct_works/.test(sql) && calls++ === 0) return Promise.reject(Object.assign(new Error('Connection terminated'), { code: 'ECONNRESET' })); return app.db.execute(sql, p); } };
    await assert.rejects(renameDepartment(flaky, { from: LD, to: NEW }), /Connection terminated/);
    assert.ok(await app.db.queryOne('SELECT name FROM dkct_app_departments WHERE name = ?', [LD]), 'chưa đổi danh sách tổ');
    assert.equal((await app.db.queryOne("SELECT department FROM dkct_app_users WHERE id = 'u1'")).department, NEW, 'đã đổi một phần');
    const done = await renameDepartment(app.db, { from: LD, to: NEW, shortName: 'TNKVLĐ' });
    assert.equal(done.to, NEW);
    assert.deepEqual(await app.db.query('SELECT name, shortName FROM dkct_app_departments'), [{ name: NEW, shortName: 'TNKVLĐ' }]);
    assert.deepEqual((await app.db.query('SELECT department, lastNumber FROM dkct_counters WHERE department LIKE ? ORDER BY department', [`%${NEW}`]))
      .map(r => [r.department, r.lastNumber]).sort(), [[NEW, 7], [`PA:${NEW}`, 3]].sort(), 'bộ đếm chuyển theo, số đánh tiếp');
    assert.equal((await app.db.queryOne('SELECT department FROM dkct_team_areas')).department, NEW);
    assert.equal(await app.db.queryOne("SELECT value FROM dkct_settings WHERE name = 'department.rename'"), null, 'xóa dấu đang đổi');
  } finally { app.close(); }
});
