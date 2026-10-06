/**
 * Bảng của module ĐKCT (tiền tố dkct_), dùng chung một định nghĩa cho MySQL, SQLite
 * (cơ chế hai CSDL của ChatLan) và Postgres (bản chạy độc lập trên Supabase, db.dialect = 'postgres'). migrate() chạy được nhiều lần (IF NOT EXISTS),
 * rồi nạp dữ liệu danh mục ban đầu khi bảng còn trống.
 */
const crypto = require('node:crypto');

const TYPES = {
  mysql: { id: 'VARCHAR(64)', short: 'VARCHAR(191)', str: 'VARCHAR(255)', text: 'TEXT', long: 'MEDIUMTEXT', int: 'INT', time: 'VARCHAR(16)', blob: 'LONGBLOB', now: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
  postgres: { id: 'VARCHAR(64)', short: 'VARCHAR(191)', str: 'VARCHAR(255)', text: 'TEXT', long: 'TEXT', int: 'INTEGER', time: 'VARCHAR(16)', blob: 'BYTEA', now: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
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
    // Trạm biến áp, mỗi trạm thuộc một đơn vị QLVH và một Truyền tải điện khu vực (tự điền vào phương án khi chọn trạm)
    dkct_substations: `
      id ${t.id} PRIMARY KEY,
      name ${t.str} NOT NULL,
      stationId ${t.id} NOT NULL,
      note ${t.text},
      transmissionName ${t.str},
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
      changeKind ${t.short},
      changeAt ${t.time},
      changeNote ${t.text},
      prevStart ${t.time},
      prevEnd ${t.time},
      rowHash VARCHAR(40) NOT NULL UNIQUE,
      sourceFile ${t.str},
      importedBy ${t.id},
      importedAt ${t.now}`,
    // Công việc không có lịch cắt điện (làm việc không cắt điện, lịch nội bộ...): gốc của luồng thay cho dòng lịch;
    // biên bản KSHT, phương án, giấy ĐKCT gắn qua workId. Thuộc tổ lập (khác lịch cắt điện dùng chung mọi tổ).
    dkct_works: `
      id ${t.id} PRIMARY KEY,
      department ${t.short},
      content ${t.text} NOT NULL,
      stationName ${t.str},
      substationId ${t.id},
      location ${t.text},
      scope ${t.text},
      startTime ${t.time},
      endTime ${t.time},
      note ${t.text},
      createdBy ${t.id},
      updatedBy ${t.id},
      createdAt ${t.now},
      updatedAt ${t.now},
      CONSTRAINT fk_dkct_works_substation FOREIGN KEY (substationId) REFERENCES dkct_substations (id)
        ON UPDATE CASCADE ON DELETE SET NULL`,
    // Biên bản khảo sát hiện trường; ảnh sơ đồ một sợi (base64) để cột riêng, không đọc khi liệt kê
    dkct_surveys: `
      id ${t.id} PRIMARY KEY,
      department ${t.short},
      surveyTime ${t.time},
      stationName ${t.str},
      substationId ${t.id},
      workContent ${t.text},
      outageId ${t.id},
      workId ${t.id},
      data ${t.long} NOT NULL,
      diagram ${t.long},
      diagramType ${t.short},
      createdBy ${t.id},
      updatedBy ${t.id},
      createdAt ${t.now},
      updatedAt ${t.now},
      CONSTRAINT fk_dkct_surveys_substation FOREIGN KEY (substationId) REFERENCES dkct_substations (id)
        ON UPDATE CASCADE ON DELETE SET NULL,
      CONSTRAINT fk_dkct_surveys_work FOREIGN KEY (workId) REFERENCES dkct_works (id)
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
      workId ${t.id},
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
        ON UPDATE CASCADE ON DELETE SET NULL,
      CONSTRAINT fk_dkct_plans_work FOREIGN KEY (workId) REFERENCES dkct_works (id)
        ON UPDATE CASCADE ON DELETE SET NULL`,
    // Giấy ĐKCT: lập từ dòng lịch (outageId), công việc không cắt điện (workId), biên bản KSHT (surveyId) hoặc phương án (planId)
    dkct_registrations: `
      id ${t.id} PRIMARY KEY,
      docSeq ${t.int} NOT NULL,
      docYear ${t.int} NOT NULL,
      docDepartment ${t.short} NOT NULL,
      docNumber ${t.short} NOT NULL,
      department ${t.short},
      outageId ${t.id},
      workId ${t.id},
      surveyId ${t.id},
      planId ${t.id},
      workContent ${t.text},
      startTime ${t.time},
      endTime ${t.time},
      recipientName ${t.str},
      data ${t.long} NOT NULL,
      createdBy ${t.id},
      updatedBy ${t.id},
      createdAt ${t.now},
      updatedAt ${t.now},
      UNIQUE (docDepartment, docYear, docSeq),
      CONSTRAINT fk_dkct_reg_work FOREIGN KEY (workId) REFERENCES dkct_works (id)
        ON UPDATE CASCADE ON DELETE SET NULL,
      CONSTRAINT fk_dkct_reg_survey FOREIGN KEY (surveyId) REFERENCES dkct_surveys (id)
        ON UPDATE CASCADE ON DELETE SET NULL,
      CONSTRAINT fk_dkct_reg_plan FOREIGN KEY (planId) REFERENCES dkct_plans (id)
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
    // Thư viện cô lập mạch dòng (Phụ lục II của phương án): biến dòng (TI) của trạm; revision tăng khi bản vẽ cập nhật.
    // status: DRAFT (cần kiểm tra) | VERIFIED (kỹ sư đã đối chiếu bản vẽ). Ẩn thay vì xóa (active = 0).
    dkct_ct_transformers: `
      id ${t.id} PRIMARY KEY,
      substationId ${t.id} NOT NULL,
      bay ${t.short},
      name ${t.str} NOT NULL,
      panel ${t.str},
      drawingNumber ${t.str},
      note ${t.text},
      status ${t.short} NOT NULL DEFAULT 'DRAFT',
      revision ${t.int} NOT NULL DEFAULT 1,
      verifiedBy ${t.id},
      verifiedAt ${t.time},
      active ${t.int} NOT NULL DEFAULT 1,
      createdBy ${t.id},
      updatedBy ${t.id},
      createdAt ${t.now},
      updatedAt ${t.now},
      CONSTRAINT fk_dkct_ct_substation FOREIGN KEY (substationId) REFERENCES dkct_substations (id)
        ON UPDATE CASCADE ON DELETE CASCADE`,
    // Ảnh các trang mạch dòng (trình duyệt dựng từ PDF, hoặc ảnh chụp); chỉ lưu trang mạch dòng, không lưu cả bộ PDF.
    // Trang của revision cũ giữ lại: phương án đã lập vẫn xem lại được nguồn.
    dkct_ct_pages: `
      id ${t.id} PRIMARY KEY,
      transformerId ${t.id} NOT NULL,
      revision ${t.int} NOT NULL DEFAULT 1,
      pageLabel ${t.short},
      fileName ${t.str},
      image ${t.blob} NOT NULL,
      imageType ${t.short} NOT NULL,
      width ${t.int},
      height ${t.int},
      uploadedBy ${t.id},
      createdAt ${t.now},
      CONSTRAINT fk_dkct_ct_pages_ct FOREIGN KEY (transformerId) REFERENCES dkct_ct_transformers (id)
        ON UPDATE CASCADE ON DELETE CASCADE`,
    // Core của TI: khối hàng kẹp tại tủ trung gian, tham chiếu bản vẽ, vùng nguồn trên ảnh trang (phần vạn, 0..10000)
    dkct_ct_cores: `
      id ${t.id} PRIMARY KEY,
      transformerId ${t.id} NOT NULL,
      sortOrder ${t.int} NOT NULL DEFAULT 0,
      coreNo ${t.int},
      terminalBlock ${t.short},
      drawingRef ${t.str},
      spec ${t.str},
      pageId ${t.id},
      regionX ${t.int},
      regionY ${t.int},
      regionW ${t.int},
      regionH ${t.int},
      createdAt ${t.now},
      updatedAt ${t.now},
      CONSTRAINT fk_dkct_ct_cores_ct FOREIGN KEY (transformerId) REFERENCES dkct_ct_transformers (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT fk_dkct_ct_cores_page FOREIGN KEY (pageId) REFERENCES dkct_ct_pages (id)
        ON UPDATE CASCADE ON DELETE SET NULL`,
    // 6 dòng mỗi core (seq 1..6 = L1 kẹp 1, L1 kẹp 4, L2 2, L2 5, L3 3, L3 6); null = CHƯA ĐỦ DỮ LIỆU
    dkct_ct_points: `
      id ${t.id} PRIMARY KEY,
      coreId ${t.id} NOT NULL,
      seq ${t.int} NOT NULL,
      phase ${t.short} NOT NULL,
      terminal ${t.short},
      ctTerminal ${t.short},
      UNIQUE (coreId, seq),
      CONSTRAINT fk_dkct_ct_points_core FOREIGN KEY (coreId) REFERENCES dkct_ct_cores (id)
        ON UPDATE CASCADE ON DELETE CASCADE`,
    // Nhật ký thay đổi thư viện mạch dòng (chỉ ghi thêm; giữ cả khi TI bị ẩn)
    dkct_ct_audit: `
      id ${t.id} PRIMARY KEY,
      transformerId ${t.id} NOT NULL,
      action ${t.short} NOT NULL,
      detail ${t.long},
      userId ${t.id},
      createdAt ${t.now}`,
    // Lịch sử thay đổi của từng dòng lịch cắt điện qua các lần nạp lại (phát sinh, hoãn, dời, sửa, có lại)
    dkct_outage_changes: `
      id ${t.id} PRIMARY KEY,
      outageId ${t.id} NOT NULL,
      kind ${t.short} NOT NULL,
      note ${t.text},
      prevStart ${t.time},
      prevEnd ${t.time},
      newStart ${t.time},
      newEnd ${t.time},
      source ${t.str},
      changedAt ${t.time} NOT NULL,
      CONSTRAINT fk_dkct_outage_changes_outage FOREIGN KEY (outageId) REFERENCES dkct_outages (id)
        ON UPDATE CASCADE ON DELETE CASCADE`,
    // Nhật ký các lần tải lịch từ trang Công ty (tự động theo giờ hẹn / bấm tay); slot duy nhất để nhiều tiến trình không tải trùng
    dkct_outage_fetches: `
      id ${t.id} PRIMARY KEY,
      slot ${t.short} NOT NULL UNIQUE,
      mode ${t.short} NOT NULL,
      fromDate ${t.time},
      toDate ${t.time},
      startedAt ${t.time} NOT NULL,
      finishedAt ${t.time},
      ok ${t.int},
      rowsCount ${t.int},
      summary ${t.text},
      error ${t.text},
      actorId ${t.id}`,
    // Khu vực truyền tải điện (TTĐ) mà mỗi tổ phụ trách: lọc "Chỉ tổ của tôi", báo thay đổi lịch cho tổ trưởng
    dkct_team_areas: `
      id ${t.id} PRIMARY KEY,
      department ${t.short} NOT NULL,
      area ${t.short} NOT NULL,
      createdAt ${t.now},
      CONSTRAINT uq_dkct_team_areas UNIQUE (department, area)`,
    // Trạm tổ tích chọn phụ trách, theo khóa trạm "220|phanthiet" (services/outageArea: nhận cả trạm chỉ có trong lịch
    // cắt điện); tổ đã tích trạm thì "Chỉ tổ của tôi" chỉ gồm các trạm này. Một trạm có thể thuộc nhiều tổ.
    dkct_team_stations: `
      id ${t.id} PRIMARY KEY,
      department ${t.short} NOT NULL,
      subKey ${t.short} NOT NULL,
      name ${t.str} NOT NULL,
      updatedBy ${t.id},
      createdAt ${t.now},
      CONSTRAINT uq_dkct_team_stations UNIQUE (department, subKey)`,
    // Mẫu Word admin tải lên cho từng loại văn bản (survey | plan | registration | confirmation); active = 1: đang dùng
    // (mỗi loại tối đa một mẫu đang dùng; không có thì dùng mẫu gốc trong templates/)
    dkct_doc_templates: `
      id ${t.id} PRIMARY KEY,
      kind ${t.short} NOT NULL,
      name ${t.str} NOT NULL,
      note ${t.text},
      fileName ${t.str},
      content ${t.blob} NOT NULL,
      size ${t.int},
      active ${t.int} NOT NULL DEFAULT 0,
      createdBy ${t.id},
      createdAt ${t.now},
      updatedBy ${t.id},
      updatedAt ${t.now},
      revision ${t.int} NOT NULL DEFAULT 1`,
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
  ['idx_dkct_doc_templates_kind', 'dkct_doc_templates', 'kind'],
  ['idx_dkct_outage_changes_outage', 'dkct_outage_changes', 'outageId'],
  ['idx_dkct_outage_fetches_started', 'dkct_outage_fetches', 'startedAt'],
  ['idx_dkct_reg_department', 'dkct_registrations', 'department'],
  ['idx_dkct_reg_outage', 'dkct_registrations', 'outageId'],
  ['idx_dkct_reg_work', 'dkct_registrations', 'workId'],
  ['idx_dkct_reg_survey', 'dkct_registrations', 'surveyId'],
  ['idx_dkct_reg_plan', 'dkct_registrations', 'planId'],
  ['idx_dkct_works_department', 'dkct_works', 'department'],
  ['idx_dkct_survey_work', 'dkct_surveys', 'workId'],
  ['idx_dkct_plan_work', 'dkct_plans', 'workId'],
  ['idx_dkct_personnel_name', 'dkct_personnel', 'fullName'],
  ['idx_dkct_survey_department', 'dkct_surveys', 'department'],
  ['idx_dkct_substation_station', 'dkct_substations', 'stationId'],
  ['idx_dkct_survey_substation', 'dkct_surveys', 'substationId'],
  ['idx_dkct_plan_department', 'dkct_plans', 'department'],
  ['idx_dkct_confirmation_department', 'dkct_confirmations', 'department'],
  ['idx_dkct_ct_substation', 'dkct_ct_transformers', 'substationId'],
  ['idx_dkct_ct_pages_ct', 'dkct_ct_pages', 'transformerId'],
  ['idx_dkct_ct_cores_ct', 'dkct_ct_cores', 'transformerId'],
  ['idx_dkct_ct_audit_ct', 'dkct_ct_audit', 'transformerId']
];

// Cột thêm sau khi bảng đã có dữ liệu (CSDL cài từ bản trước): [bảng, cột, kiểu, khóa ngoại?]
const ADDED_COLUMNS = (t) => [
  ['dkct_stations', 'shortName', t.short],
  ['dkct_stations', 'leaderName', t.str],
  ['dkct_substations', 'transmissionName', t.str],
  // (cũ) tổ phụ trách riêng trạm: đã chuyển sang dkct_team_stations khi migrate
  ['dkct_substations', 'teamDepartment', t.short],
  // so sánh khi nạp lại lịch: NEW (phát sinh) | POSTPONED (hoãn) | MOVED (dời lịch) | EDITED (sửa nội dung);
  // thời điểm so sánh, ghi chú (lý do / giờ cũ -> mới), giờ đăng ký trước khi dời
  ['dkct_outages', 'changeKind', t.short],
  ['dkct_outages', 'changeAt', t.time],
  ['dkct_outages', 'changeNote', t.text],
  ['dkct_outages', 'prevStart', t.time],
  ['dkct_outages', 'prevEnd', t.time],
  ['dkct_surveys', 'substationId', t.id,
    { name: 'fk_dkct_surveys_substation', ref: 'dkct_substations (id)', rule: 'ON UPDATE CASCADE ON DELETE SET NULL' }],
  // công việc không có lịch cắt điện; giấy ĐKCT nối biên bản KSHT / phương án đã dùng để lập
  ...[['dkct_surveys', 'workId', 'fk_dkct_surveys_work', 'dkct_works'], ['dkct_plans', 'workId', 'fk_dkct_plans_work', 'dkct_works'],
    ['dkct_registrations', 'workId', 'fk_dkct_reg_work', 'dkct_works'], ['dkct_registrations', 'surveyId', 'fk_dkct_reg_survey', 'dkct_surveys'],
    ['dkct_registrations', 'planId', 'fk_dkct_reg_plan', 'dkct_plans']]
    .map(([table, column, name, ref]) => [table, column, t.id, { name, ref: `${ref} (id)`, rule: 'ON UPDATE CASCADE ON DELETE SET NULL' }])
];

async function addColumn(db, [table, column, type, fk]) {
  const exists = /duplicate column/i;
  if (db.dialect === 'postgres') {
    const ref = fk ? ` REFERENCES ${fk.ref} ${fk.rule}` : '';
    await db.execute(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}${ref}`);
    return;
  }
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

/** Nạp Truyền tải điện khu vực của các TBA (seeds/substations.json) MỘT lần; trạm đã ghi thì giữ nguyên. */
async function importTransmissionNames(db) {
  const MARK = 'import:substation-transmission-2026-09';
  if (await db.queryOne('SELECT name FROM dkct_settings WHERE name = ?', [MARK])) return;
  const rows = require('./seeds/substations.json').filter(r => r.transmission);
  const subs = await db.query('SELECT id, name, transmissionName FROM dkct_substations');
  for (const s of subs) {
    const r = !s.transmissionName && rows.find(x => sameUnitName(x.substation, s.name));
    if (r) await db.execute('UPDATE dkct_substations SET transmissionName = ? WHERE id = ?', [r.transmission, s.id]);
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
  if (db.dialect === 'postgres') return; // bản Postgres cài mới, không có bảng cũ
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

/** Mọi định nghĩa cột (để bản Postgres trả lại tên cột camelCase, xem pgDb.js). */
const COLUMN_TEXT = Object.values(tables(TYPES.sqlite)).join(',');

async function migrate(db) {
  const dialect = db.dialect === 'postgres' ? 'postgres' : db.isMySQL ? 'mysql' : 'sqlite';
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
  await importTransmissionNames(db);
  await migrateTeamSubstations(db);
}

/**
 * Trạm giao cho tổ theo cách cũ (cột dkct_substations.teamDepartment, bảng dkct_team_substations) -> trạm tổ tích chọn
 * (dkct_team_stations); xóa dữ liệu cũ để chỉ chuyển một lần.
 */
async function migrateTeamSubstations(db) {
  const { subKey } = require('./services/outageArea');
  const rows = (await db.query('SELECT name, teamDepartment AS department FROM dkct_substations WHERE teamDepartment IS NOT NULL'))
    .map(r => ({ ...r, subKey: subKey(r.name) }));
  const exists = db.dialect === 'postgres'
    ? await db.queryOne("SELECT 1 AS ok FROM information_schema.tables WHERE table_name = 'dkct_team_substations'")
    : db.isMySQL
      ? await db.queryOne("SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'dkct_team_substations'")
      : await db.queryOne("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'dkct_team_substations'");
  if (exists) rows.push(...await db.query('SELECT subKey, name, department FROM dkct_team_substations'));
  for (const r of rows) {
    if (!r.subKey || !r.department) continue;
    await db.execute('INSERT IGNORE INTO dkct_team_stations (id, department, subKey, name) VALUES (?, ?, ?, ?)',
      [newId('TTR'), r.department, r.subKey, r.name]);
  }
  await db.execute('UPDATE dkct_substations SET teamDepartment = NULL WHERE teamDepartment IS NOT NULL');
  if (exists) await db.execute('DROP TABLE dkct_team_substations');
}

module.exports = { migrate, COLUMN_TEXT, newId, sameUnitName, drawingSortOrder, DEFAULT_DRAWING_LABEL };
