/**
 * Số giấy ĐKCT "<n>/ĐK-<tên viết tắt tổ>": một bộ đếm cho mỗi (tổ, năm), sang năm mới bắt đầu lại từ 1.
 * Có thể đặt số khởi đầu (vd chuyển từ sổ giấy giữa năm) nhưng không lùi về số đã cấp.
 * Lấy số nguyên tử để hai giấy lưu cùng lúc không trùng số.
 * legacyLastIssued(department, year): số lớn nhất module ĐKCT cũ của ChatLan đã cấp — để số tiếp nối.
 */
function formatNumber(n, shortName) {
  return `${n}/ĐK${shortName ? `-${shortName}` : ''}`;
}

/** Số phương án "<n>/PA-<tên viết tắt tổ>.<hậu tố>", vd "12/PA-TNLĐ.Nhatthu". */
function formatPlanNumber(n, shortName, suffix) {
  return `${n}/PA${shortName ? `-${shortName}` : ''}${suffix ? `.${suffix}` : ''}`;
}

/** Số giấy xác nhận đủ điều kiện đóng điện "<n>/GXN-<tên viết tắt tổ>", vd "5/GXN-TNKH". */
function formatConfirmationNumber(n, shortName) {
  return `${n}/GXN${shortName ? `-${shortName}` : ''}`;
}

/**
 * options.table: bảng chứa các văn bản đã cấp số (docSeq, docDepartment, docYear);
 * options.prefix: tiền tố khóa bộ đếm để mỗi loại văn bản (giấy ĐKCT, phương án) đếm riêng.
 */
function createNumbering(db, legacyLastIssued = async () => 0, { table = 'dkct_registrations', prefix = '' } = {}) {
  const key = (department) => `${prefix}${department}`;
  const legacy = prefix ? async () => 0 : legacyLastIssued;

  async function lastIssued(department, year) {
    const row = await db.queryOne(
      `SELECT MAX(docSeq) AS n FROM ${table} WHERE docDepartment = ? AND docYear = ?`,
      [department, year]
    );
    return Math.max(Number(row?.n) || 0, Number(await legacy(department, year)) || 0);
  }

  async function ensureCounter(department, year) {
    const exists = await db.queryOne('SELECT lastNumber FROM dkct_counters WHERE department = ? AND year = ?', [key(department), year]);
    if (exists) return;
    await db.execute(
      'INSERT IGNORE INTO dkct_counters (department, year, lastNumber) VALUES (?, ?, ?)',
      [key(department), year, await lastIssued(department, year)]
    );
  }

  async function peek(department, year) {
    await ensureCounter(department, year);
    const row = await db.queryOne('SELECT lastNumber FROM dkct_counters WHERE department = ? AND year = ?', [key(department), year]);
    const last = Number(row?.lastNumber) || 0;
    return { lastNumber: last, nextNumber: last + 1, lastIssued: await lastIssued(department, year) };
  }

  async function increment(department, year) {
    if (db.isMySQL) {
      // LAST_INSERT_ID(expr) trả giá trị mới ngay trên chính câu lệnh này
      const result = await db.execute(
        'UPDATE dkct_counters SET lastNumber = LAST_INSERT_ID(lastNumber + 1) WHERE department = ? AND year = ?',
        [key(department), year]
      );
      if (!Number(result.affectedRows)) throw new Error(`Không có bộ đếm số giấy cho ${department}/${year}`);
      return Number(result.insertId);
    }
    const rows = await db.query(
      'UPDATE dkct_counters SET lastNumber = lastNumber + 1 WHERE department = ? AND year = ? RETURNING lastNumber',
      [key(department), year]
    );
    if (!rows[0]) throw new Error(`Không có bộ đếm số giấy cho ${department}/${year}`);
    return Number(rows[0].lastNumber);
  }

  /** Lấy số kế tiếp; nếu module cũ đã cấp tới số này thì nhảy qua (hai module còn chạy song song). */
  async function takeNext(department, year) {
    await ensureCounter(department, year);
    const n = await increment(department, year);
    const old = Number(await legacy(department, year)) || 0;
    if (n > old) return n;
    await db.execute(
      'UPDATE dkct_counters SET lastNumber = ? WHERE department = ? AND year = ? AND lastNumber < ?',
      [old, key(department), year, old]
    );
    return increment(department, year);
  }

  async function setStartNumber(department, year, startNumber, userId) {
    const n = Number.parseInt(startNumber, 10);
    if (!Number.isInteger(n) || n < 1 || n > 999999) {
      throw Object.assign(new Error('Số khởi đầu phải là số nguyên từ 1.'), { status: 400 });
    }
    const issued = await lastIssued(department, year);
    if (n <= issued) {
      throw Object.assign(new Error(`Năm ${year} đã cấp đến số ${issued}; số khởi đầu phải lớn hơn ${issued}.`), { status: 400 });
    }
    await ensureCounter(department, year);
    await db.execute(
      'UPDATE dkct_counters SET lastNumber = ?, updatedBy = ?, updatedAt = CURRENT_TIMESTAMP WHERE department = ? AND year = ?',
      [n - 1, userId || null, key(department), year]
    );
    return peek(department, year);
  }

  return { peek, takeNext, setStartNumber, lastIssued };
}

module.exports = { createNumbering, formatNumber, formatPlanNumber, formatConfirmationNumber };
