/**
 * Bảng của module ĐKCT (tiền tố dkct_), dùng chung một định nghĩa cho MySQL và SQLite
 * như cơ chế hai CSDL của ChatLan. migrate() chạy được nhiều lần (IF NOT EXISTS),
 * rồi nạp dữ liệu danh mục ban đầu khi bảng còn trống.
 */
const crypto = require('node:crypto');

const TYPES = {
  mysql: { id: 'VARCHAR(64)', short: 'VARCHAR(191)', str: 'VARCHAR(255)', text: 'TEXT', long: 'MEDIUMTEXT', int: 'INT', time: 'VARCHAR(16)', blob: 'LONGBLOB', now: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
  sqlite: { id: 'TEXT', short: 'TEXT', str: 'TEXT', text: 'TEXT', long: 'TEXT', int: 'INTEGER', time: 'TEXT', blob: 'BLOB', now: 'DATETIME DEFAULT CURRENT_TIMESTAMP' }
};

function tables(t) {
  return {
    dkct_personnel: `
      id ${t.id} PRIMARY KEY,
      fullName ${t.str} NOT NULL,
      safetyLevel ${t.short},
      safetyCard ${t.short},
      department ${t.short},
      position ${t.str},
      userId ${t.id},
      active ${t.int} NOT NULL DEFAULT 1,
      createdAt ${t.now},
      updatedAt ${t.now}`,
    // Đơn vị QLVH (nơi nhận giấy ĐKCT): tổ QLVH / tổ thao tác lưu động, người phụ trách, tên viết tắt
    dkct_stations: `
      id ${t.id} PRIMARY KEY,
      name ${t.str} NOT NULL,
      shortName ${t.short},
      leaderName ${t.str},
      email ${t.str},
      phone ${t.short},
      note ${t.text},
      active ${t.int} NOT NULL DEFAULT 1,
      createdAt ${t.now},
      updatedAt ${t.now}`,
    // Trạm biến áp, mỗi trạm thuộc một đơn vị QLVH
    dkct_substations: `
      id ${t.id} PRIMARY KEY,
      name ${t.str} NOT NULL,
      stationId ${t.id} NOT NULL,
      note ${t.text},
      sortOrder ${t.int} NOT NULL DEFAULT 0,
      active ${t.int} NOT NULL DEFAULT 1,
      createdAt ${t.now},
      updatedAt ${t.now},
      CONSTRAINT fk_dkct_substations_station FOREIGN KEY (stationId) REFERENCES dkct_stations (id)
        ON UPDATE CASCADE ON DELETE RESTRICT`,
    // Bản vẽ sơ đồ trạm (PDF gốc + ảnh của trang được chọn, do trình duyệt dựng). Mỗi TBA có thể có nhiều sơ đồ,
    // vd TBA 500kV: "Phía 500kV", "Phía 220kV"; tên sơ đồ không trùng trong một trạm.
    dkct_drawings: `
      id ${t.id} PRIMARY KEY,
      substationId ${t.id} NOT NULL,
      label ${t.short} NOT NULL,
      sortOrder ${t.int} NOT NULL DEFAULT 0,
      fileName ${t.str},
      pdf ${t.blob} NOT NULL,
      pdfSize ${t.int},
      page ${t.int} NOT NULL DEFAULT 1,
      pageCount ${t.int},
      image ${t.blob} NOT NULL,
      imageType ${t.short} NOT NULL,
      width ${t.int},
      height ${t.int},
      uploadedBy ${t.id},
      createdAt ${t.now},
      updatedAt ${t.now},
      CONSTRAINT uq_dkct_drawings_label UNIQUE (substationId, label),
      CONSTRAINT fk_dkct_drawings_sub FOREIGN KEY (substationId) REFERENCES dkct_substations (id)
        ON UPDATE CASCADE ON DELETE CASCADE`,
    dkct_duties: `
      id ${t.id} PRIMARY KEY,
      name ${t.str} NOT NULL,
      sortOrder ${t.int} NOT NULL DEFAULT 0,
      active ${t.int} NOT NULL DEFAULT 1,
      createdAt ${t.now},
      updatedAt ${t.now}`,
    dkct_risks: `
      id ${t.id} PRIMARY KEY,
      hazard ${t.text} NOT NULL,
      measures ${t.text},
      performer ${t.text},
      sortOrder ${t.int} NOT NULL DEFAULT 0,
      active ${t.int} NOT NULL DEFAULT 1,
      createdAt ${t.now},
      updatedAt ${t.now}`,
    dkct_outages: `
      id ${t.id} PRIMARY KEY,
      regStart ${t.time} NOT NULL,
      regEnd ${t.time} NOT NULL,
      actualStart ${t.time},
      actualEnd ${t.time},
      location ${t.text},
      content ${t.text} NOT NULL,
      scope ${t.text},
      registrationUnit ${t.str},
      workUnit ${t.str},
      status ${t.str},
      rowHash VARCHAR(40) NOT NULL UNIQUE,
      sourceFile ${t.str},
      importedBy ${t.id},
      importedAt ${t.now}`,
    dkct_registrations: `
      id ${t.id} PRIMARY KEY,
      docSeq ${t.int} NOT NULL,
      docYear ${t.int} NOT NULL,
      docDepartment ${t.short} NOT NULL,
      docNumber ${t.short} NOT NULL,
      department ${t.short},
      outageId ${t.id},
      workContent ${t.text},
      startTime ${t.time},
      endTime ${t.time},
      recipientName ${t.str},
      data ${t.long} NOT NULL,
      createdBy ${t.id},
      updatedBy ${t.id},
      createdAt ${t.now},
      updatedAt ${t.now},
      UNIQUE (docDepartment, docYear, docSeq)`,
    // Biên bản khảo sát hiện trường; ảnh sơ đồ một sợi (base64) để cột riêng, không đọc khi liệt kê
    dkct_surveys: `
      id ${t.id} PRIMARY KEY,
      department ${t.short},
      surveyTime ${t.time},
      stationName ${t.str},
      substationId ${t.id},
      workContent ${t.text},
      outageId ${t.id},
      data ${t.long} NOT NULL,
      diagram ${t.long},
      diagramType ${t.short},
      createdBy ${t.id},
      updatedBy ${t.id},
      createdAt ${t.now},
      updatedAt ${t.now},
      CONSTRAINT fk_dkct_surveys_substation FOREIGN KEY (substationId) REFERENCES dkct_substations (id)
        ON UPDATE CASCADE ON DELETE SET NULL`,
    // Phương án thi công, biện pháp an toàn (thí nghiệm); số "<n>/PA-<tổ>.<hậu tố>" đếm riêng theo tổ, năm
    dkct_plans: `
      id ${t.id} PRIMARY KEY,
      docSeq ${t.int} NOT NULL,
      docYear ${t.int} NOT NULL,
      docDepartment ${t.short} NOT NULL,
      docNumber ${t.short} NOT NULL,
      department ${t.short},
      workTitle ${t.text},
      stationName ${t.str},
      startTime ${t.time},
      substationId ${t.id},
      surveyId ${t.id},
      outageId ${t.id},
      data ${t.long} NOT NULL,
      createdBy ${t.id},
      updatedBy ${t.id},
      createdAt ${t.now},
      updatedAt ${t.now},
      UNIQUE (docDepartment, docYear, docSeq),
      CONSTRAINT fk_dkct_plans_substation FOREIGN KEY (substationId) REFERENCES dkct_substations (id)
        ON UPDATE CASCADE ON DELETE SET NULL,
      CONSTRAINT fk_dkct_plans_survey FOREIGN KEY (surveyId) REFERENCES dkct_surveys (id)
        ON UPDATE CASCADE ON DELETE SET NULL,
      CONSTRAINT fk_dkct_plans_outage FOREIGN KEY (outageId) REFERENCES dkct_outages (id)
        ON UPDATE CASCADE ON DELETE SET NULL`,
    // Giấy xác nhận đủ điều kiện đóng điện: số "<n>/GXN-<tổ>" đếm riêng theo tổ, năm; lập từ giấy ĐKCT hoặc tự ghi
    dkct_confirmations: `
      id ${t.id} PRIMARY KEY,
      docSeq ${t.int} NOT NULL,
      docYear ${t.int} NOT NULL,
      docDepartment ${t.short} NOT NULL,
      docNumber ${t.short} NOT NULL,
      department ${t.short},
      stationName ${t.str},
      bays ${t.text},
      workDate ${t.time},
      substationId ${t.id},
      registrationId ${t.id},
      planId ${t.id},
      data ${t.long} NOT NULL,
      createdBy ${t.id},
      updatedBy ${t.id},
      createdAt ${t.now},
      updatedAt ${t.now},
      UNIQUE (docDepartment, docYear, docSeq),
      CONSTRAINT fk_dkct_confirmations_substation FOREIGN KEY (substationId) REFERENCES dkct_substations (id)
        ON UPDATE CASCADE ON DELETE SET NULL,
      CONSTRAINT fk_dkct_confirmations_registration FOREIGN KEY (registrationId) REFERENCES dkct_registrations (id)
        ON UPDATE CASCADE ON DELETE SET NULL,
      CONSTRAINT fk_dkct_confirmations_plan FOREIGN KEY (planId) REFERENCES dkct_plans (id)
        ON UPDATE CASCADE ON DELETE SET NULL`,
    // Cài đặt/dấu mốc của module (vd đã nạp dữ liệu bổ sung nào)
    dkct_settings: `
      name ${t.short} PRIMARY KEY,
      value ${t.text},
      updatedAt ${t.now}`,
    dkct_counters: `
      department ${t.short} NOT NULL,
      year ${t.int} NOT NULL,
      lastNumber ${t.int} NOT NULL DEFAULT 0,
      updatedBy ${t.id},
      updatedAt ${t.now},
      PRIMARY KEY (department, year)`
  };
}

const INDEXES = [
  ['idx_dkct_outages_start', 'dkct_outages', 'regStart'],
  ['idx_dkct_reg_department', 'dkct_registrations', 'department'],
  ['idx_dkct_reg_outage', 'dkct_registrations', 'outageId'],
  ['idx_dkct_personnel_name', 'dkct_personnel', 'fullName'],
  ['idx_dkct_survey_department', 'dkct_surveys', 'department'],
  ['idx_dkct_substation_station', 'dkct_substations', 'stationId'],
  ['idx_dkct_survey_substation', 'dkct_surveys', 'substationId'],
  ['idx_dkct_plan_department', 'dkct_plans', 'department'],
  ['idx_dkct_confirmation_department', 'dkct_confirmations', 'department']
];

// Cột thêm sau khi bảng đã có dữ liệu (CSDL cài từ bản trước): [bảng, cột, kiểu, khóa ngoại?]
const ADDED_COLUMNS = (t) => [
  ['dkct_stations', 'shortName', t.short],
  ['dkct_stations', 'leaderName', t.str],
  ['dkct_surveys', 'substationId', t.id,
    { name: 'fk_dkct_surveys_substation', ref: 'dkct_substations (id)', rule: 'ON UPDATE CASCADE ON DELETE SET NULL' }]
];

async function addColumn(db, [table, column, type, fk]) {
  const exists = /duplicate column/i;
  if (!db.isMySQL) {
    // SQLite: ADD COLUMN ... REFERENCES được phép khi cột mặc định NULL
    const ref = fk ? ` REFERENCES ${fk.ref} ${fk.rule}` : '';
    try { await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}${ref}`); } catch (e) { if (!exists.test(e.message)) throw e; }
    return;
  }
  try { await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type} NULL`); } catch (e) { if (!exists.test(e.message)) throw e; }
  if (!fk) return;
  const has = await db.queryOne(
    "SELECT 1 AS ok FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ?",
    [table, fk.name]);
  if (!has) await db.execute(`ALTER TABLE ${table} ADD CONSTRAINT ${fk.name} FOREIGN KEY (${column}) REFERENCES ${fk.ref} ${fk.rule}`);
}

const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

async function seedIfEmpty(db, table, rows, insert) {
  const row = await db.queryOne(`SELECT COUNT(*) AS n FROM ${table}`);
  if (Number(row?.n) > 0) return;
  for (let i = 0; i < rows.length; i++) await insert(rows[i], i);
}

async function seed(db) {
  await seedIfEmpty(db, 'dkct_personnel', require('./seeds/personnel.json'), (p) =>
    db.execute('INSERT INTO dkct_personnel (id, fullName, safetyLevel, safetyCard) VALUES (?, ?, ?, ?)',
      [newId('NS'), p.fullName, p.safetyLevel, p.safetyCard]));
  await seedIfEmpty(db, 'dkct_stations', require('./seeds/stations.json'), (s) =>
    db.execute('INSERT INTO dkct_stations (id, name, email, phone) VALUES (?, ?, ?, ?)',
      [newId('ST'), s.name, s.email, s.phone]));
  await seedIfEmpty(db, 'dkct_duties', require('./seeds/duties.json'), (name, i) =>
    db.execute('INSERT INTO dkct_duties (id, name, sortOrder) VALUES (?, ?, ?)', [newId('NV'), name, i + 1]));
  await seedIfEmpty(db, 'dkct_risks', require('./seeds/risks.json'), (r, i) =>
    db.execute('INSERT INTO dkct_risks (id, hazard, measures, performer, sortOrder) VALUES (?, ?, ?, ?, ?)',
      [newId('RR'), r.hazard, r.measures, r.performer, i + 1]));
}

/** "Trạm 220kV Bảo Lộc" ≈ "TBA 220kV Bảo Lộc"; bỏ qua hoa/thường, khoảng trắng thừa. */
const unitKey = (s) => String(s || '').normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim()
  .replace(/^(trạm biến áp|trạm) /, 'tba ');
const sameUnitName = (a, b) => unitKey(a) === unitKey(b);

/**
 * Nạp danh sách TBA - đơn vị QLVH - người phụ trách (seeds/substations.json) MỘT lần (dấu mốc trong dkct_settings):
 *  - đơn vị QLVH đã có (cùng tên, hoặc dòng cũ đặt theo tên trạm như "Trạm 220kV Bảo Lộc") được đổi tên chuẩn
 *    và bổ sung tên viết tắt, người phụ trách nếu còn trống; giữ id nên giấy cũ vẫn trỏ đúng, giữ email/điện thoại;
 *  - chưa có thì thêm mới; TBA chưa có thì thêm, gắn với đơn vị QLVH của nó.
 */
async function importSubstations(db) {
  const MARK = 'import:substations-2026-09';
  if (await db.queryOne('SELECT name FROM dkct_settings WHERE name = ?', [MARK])) return;
  const rows = require('./seeds/substations.json');
  const units = await db.query('SELECT id, name FROM dkct_stations');
  const subs = await db.query('SELECT id, name FROM dkct_substations');
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let unit = units.find(u => sameUnitName(u.name, r.unit)) || units.find(u => sameUnitName(u.name, r.substation));
    if (unit) {
      await db.execute(`UPDATE dkct_stations SET name = ?, shortName = COALESCE(NULLIF(shortName, ''), ?),
        leaderName = COALESCE(NULLIF(leaderName, ''), ?), updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [r.unit, r.unitShort, r.leader, unit.id]);
      unit.name = r.unit;
    } else {
      unit = { id: newId('ST'), name: r.unit };
      await db.execute('INSERT INTO dkct_stations (id, name, shortName, leaderName) VALUES (?, ?, ?, ?)', [unit.id, r.unit, r.unitShort, r.leader]);
      units.push(unit);
    }
    if (!subs.some(s => sameUnitName(s.name, r.substation))) {
      const sub = { id: newId('TBA'), name: r.substation };
      await db.execute('INSERT INTO dkct_substations (id, name, stationId, note, sortOrder) VALUES (?, ?, ?, ?, ?)',
        [sub.id, r.substation, unit.id, r.note || '', i + 1]);
      subs.push(sub);
    }
  }
  await db.execute('INSERT INTO dkct_settings (name, value) VALUES (?, ?)', [MARK, String(rows.length)]);
}

const DEFAULT_DRAWING_LABEL = 'Sơ đồ trạm';
/** Thứ tự sơ đồ trong một trạm: cấp điện áp cao trước ("Phía 500kV" trước "Phía 220kV"). */
function drawingSortOrder(label) {
  const kv = Number((/(\d{2,3})\s*kV/i.exec(String(label || '')) || [])[1]);
  return kv ? 1000 - kv : 1000;
}

/** Bảng cũ dkct_substation_drawings (một bản vẽ mỗi trạm) -> dkct_drawings, tên "Sơ đồ trạm"; xong thì xóa bảng cũ. */
async function migrateOldDrawings(db) {
  let rows;
  try { rows = await db.query('SELECT * FROM dkct_substation_drawings'); } catch { return; } // không có bảng cũ
  for (const r of rows) {
    if (await db.queryOne('SELECT id FROM dkct_drawings WHERE substationId = ? AND label = ?', [r.substationId, DEFAULT_DRAWING_LABEL])) continue;
    await db.execute(`INSERT INTO dkct_drawings (id, substationId, label, sortOrder, fileName, pdf, pdfSize, page, pageCount,
      image, imageType, width, height, uploadedBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId('BV'), r.substationId, DEFAULT_DRAWING_LABEL, drawingSortOrder(DEFAULT_DRAWING_LABEL), r.fileName, r.pdf, r.pdfSize, r.page,
      r.pageCount, r.image, r.imageType, r.width, r.height, r.uploadedBy, r.createdAt, r.updatedAt]);
  }
  await db.execute('DROP TABLE dkct_substation_drawings');
}

async function migrate(db) {
  const dialect = db.isMySQL ? 'mysql' : 'sqlite';
  const suffix = db.isMySQL ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
  for (const [name, columns] of Object.entries(tables(TYPES[dialect]))) {
    await db.execute(`CREATE TABLE IF NOT EXISTS ${name} (${columns}\n)${suffix}`);
  }
  for (const col of ADDED_COLUMNS(TYPES[dialect])) await addColumn(db, col);
  for (const [name, table, column] of INDEXES) {
    // MySQL không có CREATE INDEX IF NOT EXISTS: chỉ bỏ qua lỗi "đã tồn tại"
    try { await db.execute(`CREATE INDEX ${db.isMySQL ? '' : 'IF NOT EXISTS '}${name} ON ${table} (${column})`); } catch (e) {
      if (!/Duplicate key name|already exists/i.test(e.message)) throw e;
    }
  }
  await migrateOldDrawings(db);
  await seed(db);
  await importSubstations(db);
}

module.exports = { migrate, newId, sameUnitName, drawingSortOrder, DEFAULT_DRAWING_LABEL };
