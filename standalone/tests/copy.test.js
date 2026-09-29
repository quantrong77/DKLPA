const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { createPgDb } = require('../../server/pgDb');
const { createTestDb } = require('../../tests/helpers/sqliteDb');
const createDkctModule = require('../../server');
const { createApp, APP_TABLE_TEXT } = require('../server/app');
const { copyAll } = require('../scripts/copy-from-chatlan');
const { makePng } = require('../../tests/helpers/png');

/** CSDL "ChatLan" (SQLite) có bảng departments, danh mục mặc định và vài hồ sơ. */
async function chatlanSource() {
  const db = createTestDb();
  await db.execute('CREATE TABLE departments (name TEXT PRIMARY KEY, shortName TEXT)');
  for (const [n, s] of [['Tổ Thí nghiệm điện Khánh Hòa', 'TNKH'], ['Tổ Vận tải', 'VT'], ['Ban giám đốc', 'BGĐ'], ['Phòng Tổng hợp', 'TH']]) {
    await db.execute('INSERT INTO departments (name, shortName) VALUES (?, ?)', [n, s]);
  }
  const dkct = createDkctModule({
    db, getActor: async () => null, getProfile: async () => null, isAdmin: () => false,
    isDepartmentHead: () => false, isUnitLead: async () => false, getUnit: async () => ({})
  });
  await dkct.migrate();
  const sub = await db.queryOne('SELECT id FROM dkct_substations ORDER BY sortOrder LIMIT 1');
  await db.execute(`INSERT INTO dkct_drawings (id, substationId, label, fileName, pdf, pdfSize, page, pageCount, image, imageType, width, height)
    VALUES ('BV-1', ?, 'Sơ đồ trạm', 'so-do.pdf', ?, 4, 1, 1, ?, 'image/png', 2, 2)`, [sub.id, Buffer.from('%PDF'), makePng(2, 2)]);
  await db.execute(`INSERT INTO dkct_outages (id, regStart, regEnd, content, rowHash) VALUES ('LCD-1', '2026-10-01T07:00', '2026-10-01T17:00', 'Thí nghiệm ngăn 231', 'h1')`);
  await db.execute(`INSERT INTO dkct_registrations (id, docSeq, docYear, docDepartment, docNumber, department, outageId, workContent, data, createdAt)
    VALUES ('R-1', 7, 2026, 'Ban giám đốc', '7/ĐK-BGĐ', 'Ban giám đốc', 'LCD-1', 'Thí nghiệm', '{"a":1}', '2026-09-29 08:30:00')`);
  await db.execute(`INSERT INTO dkct_counters (department, year, lastNumber) VALUES ('Ban giám đốc', 2026, 7), ('PA:Ban giám đốc', 2026, 1)`);
  return db;
}

async function supabaseTarget() {
  const pg = new PGlite({ parsers: { 1114: (v) => v, 20: Number } });
  const db = createPgDb(pg, { names: [APP_TABLE_TEXT] });
  await createApp({ db, verifyToken: async () => null }).migrate(); // như server đã khởi động: có danh mục mặc định
  return { db, close: () => pg.close() };
}

test('chép toàn bộ dkct_* từ ChatLan: bản vẽ (nhị phân), hồ sơ, bộ đếm; tạo sẵn các tổ', async () => {
  const source = await chatlanSource();
  const target = await supabaseTarget();
  try {
    const { counts } = await copyAll({ source, target: target.db });
    for (const [t, n] of Object.entries(counts)) {
      assert.equal(Number((await target.db.queryOne(`SELECT COUNT(*) AS n FROM ${t}`)).n), n, t);
    }
    const drawing = await target.db.queryOne("SELECT pdf, image, label FROM dkct_drawings WHERE id = 'BV-1'");
    assert.ok(Buffer.isBuffer(drawing.image));
    assert.deepEqual([drawing.pdf.toString(), drawing.image.equals(makePng(2, 2)), drawing.label], ['%PDF', true, 'Sơ đồ trạm']);
    const reg = await target.db.queryOne("SELECT docNumber, outageId, createdAt FROM dkct_registrations WHERE id = 'R-1'");
    assert.deepEqual(reg, { docNumber: '7/ĐK-BGĐ', outageId: 'LCD-1', createdAt: '2026-09-29 08:30:00' });
    assert.equal((await target.db.queryOne("SELECT lastNumber FROM dkct_counters WHERE department = 'Ban giám đốc'")).lastNumber, 7);
    // danh mục mặc định của đích được thay, không bị nhân đôi
    assert.equal(counts.dkct_personnel, Number((await target.db.queryOne('SELECT COUNT(*) AS n FROM dkct_personnel')).n));
    const depts = await target.db.query('SELECT name, shortName FROM dkct_app_departments ORDER BY name');
    assert.deepEqual(depts, [
      { name: 'Ban giám đốc', shortName: 'BGĐ' },
      { name: 'Tổ Thí nghiệm điện Khánh Hòa', shortName: 'TNKH' },
      { name: 'Tổ Vận tải', shortName: 'VT' }
    ]);
  } finally { source.close(); await target.close(); }
});

test('Supabase đã có hồ sơ: dừng, không xóa gì; --force thì ghi đè', async () => {
  const source = await chatlanSource();
  const target = await supabaseTarget();
  try {
    await target.db.execute(`INSERT INTO dkct_outages (id, regStart, regEnd, content, rowHash) VALUES ('MOI', '2026-10-02T07:00', '2026-10-02T17:00', 'Lịch mới', 'h9')`);
    await assert.rejects(copyAll({ source, target: target.db }), /--force/);
    assert.ok(await target.db.queryOne("SELECT id FROM dkct_outages WHERE id = 'MOI'"));
    await copyAll({ source, target: target.db, force: true });
    assert.equal(await target.db.queryOne("SELECT id FROM dkct_outages WHERE id = 'MOI'"), null);
    assert.ok(await target.db.queryOne("SELECT id FROM dkct_outages WHERE id = 'LCD-1'"));
  } finally { source.close(); await target.close(); }
});
