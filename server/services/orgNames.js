/**
 * Tên đơn vị in trên văn bản mới: công ty, đội (đơn vị cấp trên của các tổ). Admin đặt ở Cài đặt → Tên đơn vị
 * (dkct_settings 'org.names'); khi đổi tên đơn vị, văn bản lập sau đó dùng tên mới, văn bản đã lập giữ tên lúc lập.
 * Chưa đặt: theo văn bản gần nhất của tổ, rồi tên mặc định.
 */
const { changedRows } = require('../util');

const KEY = 'org.names';
const MAX = 200;
const DEFAULT_COMPANY_NAME = 'Công ty Truyền tải điện 3';
const DEFAULT_UNIT_NAME = 'Đội Sửa chữa, thí nghiệm điện 3';

const clean = (v) => String(v ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, MAX);

function createOrgNames(db) {
  /** { companyName, unitName } admin đã đặt ('' = chưa đặt). */
  async function get() {
    const row = await db.queryOne('SELECT value FROM dkct_settings WHERE name = ?', [KEY]);
    let v = {};
    try { v = row?.value ? JSON.parse(row.value) : {}; } catch { v = {}; }
    return { companyName: clean(v.companyName), unitName: clean(v.unitName) };
  }

  async function save(input = {}) {
    const value = JSON.stringify({ companyName: clean(input.companyName), unitName: clean(input.unitName) });
    const res = await db.execute('UPDATE dkct_settings SET value = ?, updatedAt = CURRENT_TIMESTAMP WHERE name = ?', [value, KEY]);
    if (!changedRows(res)) await db.execute('INSERT INTO dkct_settings (name, value) VALUES (?, ?)', [KEY, value]);
    return get();
  }

  /**
   * Tên in trên văn bản mới: tên admin đặt, không thì của văn bản gần nhất (lastHeader), không thì mặc định.
   * fallbackUnit: deps.defaultUnitName của ứng dụng chủ (nếu có).
   */
  async function headerNames(lastHeader = {}, fallbackUnit = DEFAULT_UNIT_NAME) {
    const org = await get();
    return {
      companyName: org.companyName || lastHeader.companyName || DEFAULT_COMPANY_NAME,
      unitName: org.unitName || lastHeader.unitName || fallbackUnit || DEFAULT_UNIT_NAME
    };
  }

  return { get, save, headerNames };
}

module.exports = { createOrgNames, DEFAULT_COMPANY_NAME, DEFAULT_UNIT_NAME };
