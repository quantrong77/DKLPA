const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers/sqliteDb');
const { migrate, sameUnitName } = require('../server/schema');

test('sameUnitName: so khớp tên đơn vị/trạm bỏ qua hoa thường, khoảng trắng, "Trạm" = "TBA"', () => {
  assert.ok(sameUnitName('Trạm 220kV Bảo Lộc', 'TBA 220kV Bảo Lộc'));
  assert.ok(sameUnitName('Tổ thao tác lưu động  Phan Thiết', 'Tổ Thao tác lưu động Phan Thiết'));
  assert.ok(!sameUnitName('Trạm 220kV Đăk Nông', 'TBA 500kV Đăk Nông'));
});

test('migrate: bảng TBA có khóa ngoại tới đơn vị QLVH; nạp người phụ trách, tên viết tắt', async () => {
  const db = createTestDb();
  try {
    await migrate(db);
    const subs = await db.query(`SELECT s.name, s.transmissionName, u.name AS unit, u.shortName, u.leaderName, u.email
      FROM dkct_substations s JOIN dkct_stations u ON u.id = s.stationId ORDER BY s.sortOrder`);
    assert.equal(subs.length, 14);
    const thapCham = subs.find(s => s.name === 'TBA 220kV Tháp Chàm');
    assert.deepEqual([thapCham.unit, thapCham.shortName, thapCham.leaderName], ['Tổ Thao tác lưu động Tháp Chàm', 'TTLĐTC', 'Nguyễn Yên']);

    assert.equal(thapCham.transmissionName, 'Truyền tải điện Khánh Hòa');
    assert.equal(subs.find(s => s.name === 'TBA 220kV Phan Rí').transmissionName, 'Truyền tải điện Lâm Đồng');

    // dòng cũ "Trạm 220kV Bảo Lộc" trở thành "Tổ Thao tác lưu động Bảo Lộc", giữ email (giấy cũ vẫn trỏ đúng id)
    const baoLoc = subs.find(s => s.name === 'TBA 220kV Bảo Lộc');
    assert.equal(baoLoc.unit, 'Tổ Thao tác lưu động Bảo Lộc');
    assert.equal(baoLoc.email, 'trambaoloc@gmail.com');
    const units = await db.query('SELECT name FROM dkct_stations');
    assert.ok(!units.some(u => u.name === 'Trạm 220kV Bảo Lộc'));
    assert.equal(units.filter(u => /phan thiết/i.test(u.name)).length, 1, 'không tạo trùng Tổ TTLĐ Phan Thiết');
  } finally { db.close(); }
});

test('migrate: chạy lại không nạp trùng, không ghi đè chỉnh sửa, không hiện lại TBA đã ẩn', async () => {
  const db = createTestDb();
  try {
    await migrate(db);
    await db.execute("UPDATE dkct_stations SET leaderName = 'Người mới' WHERE name = 'Tổ Thao tác lưu động Tháp Chàm'");
    await db.execute("UPDATE dkct_substations SET active = 0, transmissionName = 'TTĐ sửa tay' WHERE name = 'TBA 220kV Hàm Tân'");
    await migrate(db);
    assert.equal((await db.queryOne("SELECT transmissionName FROM dkct_substations WHERE name = 'TBA 220kV Hàm Tân'")).transmissionName, 'TTĐ sửa tay');
    assert.equal((await db.queryOne('SELECT COUNT(*) AS n FROM dkct_substations')).n, 14);
    assert.equal((await db.queryOne("SELECT leaderName FROM dkct_stations WHERE name = 'Tổ Thao tác lưu động Tháp Chàm'")).leaderName, 'Người mới');
    assert.equal((await db.queryOne("SELECT active FROM dkct_substations WHERE name = 'TBA 220kV Hàm Tân'")).active, 0);
  } finally { db.close(); }
});

test('khóa ngoại: không xóa được đơn vị QLVH còn TBA; xóa TBA thì biên bản giữ lại, bỏ liên kết', async () => {
  const db = createTestDb();
  try {
    await migrate(db);
    const sub = await db.queryOne("SELECT id, stationId FROM dkct_substations WHERE name = 'TBA 220kV Tháp Chàm'");
    await assert.rejects(db.execute('DELETE FROM dkct_stations WHERE id = ?', [sub.stationId]), /FOREIGN KEY/i);
    await assert.rejects(db.execute("INSERT INTO dkct_substations (id, name, stationId) VALUES ('X', 'TBA lạ', 'KHONG-CO')"), /FOREIGN KEY/i);
    await db.execute("INSERT INTO dkct_surveys (id, data, substationId) VALUES ('KS-1', '{}', ?)", [sub.id]);
    const insertDrawing = (id, substationId, label) => db.execute(
      `INSERT INTO dkct_drawings (id, substationId, label, pdf, image, imageType) VALUES (?, ?, ?, ?, ?, 'png')`,
      [id, substationId, label, Buffer.from('%PDF-'), Buffer.from('x')]);
    await insertDrawing('BV-1', sub.id, 'Phía 500kV');
    await insertDrawing('BV-2', sub.id, 'Phía 220kV');
    await assert.rejects(insertDrawing('BV-3', sub.id, 'Phía 220kV'), /UNIQUE/i, 'tên sơ đồ không trùng trong một trạm');
    await assert.rejects(insertDrawing('BV-4', 'KHONG-CO', 'Sơ đồ trạm'), /FOREIGN KEY/i);
    await db.execute('DELETE FROM dkct_substations WHERE id = ?', [sub.id]);
    assert.equal((await db.queryOne("SELECT substationId FROM dkct_surveys WHERE id = 'KS-1'")).substationId, null);
    assert.equal((await db.queryOne('SELECT COUNT(*) AS n FROM dkct_drawings')).n, 0, 'xóa trạm thì xóa luôn các bản vẽ');
  } finally { db.close(); }
});

// bảng cũ chỉ có ở CSDL ChatLan (MySQL/SQLite); bản Postgres (Supabase) cài mới
test('migrate: bản vẽ ở bảng cũ (một bản/trạm) chuyển sang dkct_drawings tên "Sơ đồ trạm", xóa bảng cũ; chạy lại không lỗi',
  { skip: process.env.DKCT_TEST_DB === 'postgres' }, async () => {
  const db = createTestDb();
  try {
    await migrate(db);
    const sub = await db.queryOne("SELECT id FROM dkct_substations WHERE name = 'TBA 220kV Tháp Chàm'");
    await db.execute(`CREATE TABLE dkct_substation_drawings (substationId TEXT PRIMARY KEY, fileName TEXT, pdf BLOB NOT NULL, pdfSize INTEGER,
      page INTEGER, pageCount INTEGER, image BLOB NOT NULL, imageType TEXT NOT NULL, width INTEGER, height INTEGER, uploadedBy TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await db.execute(`INSERT INTO dkct_substation_drawings (substationId, fileName, pdf, pdfSize, page, pageCount, image, imageType, width, height)
      VALUES (?, 'cu.pdf', ?, 5, 2, 3, ?, 'png', 300, 150)`, [sub.id, Buffer.from('%PDF-'), Buffer.from('anh')]);
    await migrate(db);
    const rows = await db.query('SELECT substationId, label, fileName, page, width FROM dkct_drawings');
    assert.deepEqual(rows.map(r => ({ ...r })), [{ substationId: sub.id, label: 'Sơ đồ trạm', fileName: 'cu.pdf', page: 2, width: 300 }]);
    await assert.rejects(db.query('SELECT 1 FROM dkct_substation_drawings'), /no such table/i);
    await migrate(db);
    assert.equal((await db.queryOne('SELECT COUNT(*) AS n FROM dkct_drawings')).n, 1);
  } finally { db.close(); }
});
