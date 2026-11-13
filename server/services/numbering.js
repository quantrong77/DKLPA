/**
 * Số giấy ĐKCT "<n>/ĐK-<tên viết tắt tổ>": một bộ đếm cho mỗi (tổ, năm), sang năm mới bắt đầu lại từ 1.
 * Đặt được số khởi đầu bất kỳ từ 1 (vd theo sổ giấy cứng đã làm); khi cấp số, số đã có văn bản cùng loại, tổ, năm thì
 * tự bỏ qua — không bao giờ trùng số.
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
const MAX_SKIP = 100000;

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

  /** Số n đã có văn bản cùng loại, tổ, năm (hoặc module cũ đã cấp tới). */
  async function used(department, year, n) {
    if (n <= (Number(await legacy(department, year)) || 0)) return true;
    return !!(await db.queryOne(`SELECT 1 AS x FROM ${table} WHERE docDepartment = ? AND docYear = ? AND docSeq = ?`, [department, year, n]));
  }

  async function peek(department, year) {
    await ensureCounter(department, year);
    const row = await db.queryOne('SELECT lastNumber FROM dkct_counters WHERE department = ? AND year = ?', [key(department), year]);
    const last = Number(row?.lastNumber) || 0;
    let next = last + 1;
    for (let i = 0; i < MAX_SKIP && await used(department, year, next); i++) next += 1;
    return { lastNumber: last, nextNumber: next, lastIssued: await lastIssued(department, year) };
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

  /**
   * Lấy số kế tiếp (nguyên tử); số đã có văn bản (đặt số khởi đầu lùi lại) hoặc module cũ đã cấp tới thì nhảy qua.
   */
  async function takeNext(department, year) {
    await ensureCounter(department, year);
    const old = Number(await legacy(department, year)) || 0;
    if (old) {
      await db.execute(
        'UPDATE dkct_counters SET lastNumber = ? WHERE department = ? AND year = ? AND lastNumber < ?',
        [old, key(department), year, old]
      );
    }
    for (let i = 0; i < MAX_SKIP; i++) {
      const n = await increment(department, year);
      if (!(await used(department, year, n))) return n;
    }
    throw new Error(`Không tìm được số trống cho ${department}/${year}`);
  }

  async function setStartNumber(department, year, startNumber, userId) {
    const n = Number.parseInt(startNumber, 10);
    if (!Number.isInteger(n) || n < 1 || n > 999999) {
      throw Object.assign(new Error('Số khởi đầu phải là số nguyên từ 1.'), { status: 400 });
    }
    // số khởi đầu nhỏ hơn số đã cấp được (theo sổ giấy cứng): khi cấp, số đã có văn bản tự bỏ qua
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
