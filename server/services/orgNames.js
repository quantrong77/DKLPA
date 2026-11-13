/**
 * Tên đơn vị và chức danh (admin đặt ở Cài đặt → Tên đơn vị, chức danh; dkct_settings 'org.names'):
 * - companyName, unitName: tên công ty, đội in trên văn bản lập mới. Chưa đặt: theo văn bản gần nhất của đơn vị, rồi mặc định.
 * - teamWord: tên gọi ngắn của đơn vị trực tiếp trên văn bản (mặc định "Tổ": chức vụ gợi ý "Kỹ sư - Tổ TNLĐ").
 * - positions: chức danh gợi ý cho người của đơn vị trên văn bản (Tổ trưởng, Tổ phó, Kỹ sư, Công nhân).
 * - leadSignTitle: chức danh người ký phương án (mặc định như mẫu Word: "Đội trưởng/ Đội phó").
 * - roleLabels: tên vai trò trong phần mềm (admin, lead: trưởng/phó đơn vị, member).
 * Văn bản đã lập giữ tên, chức danh lúc lập; văn bản lập sau dùng giá trị mới.
 */
const { changedRows } = require('../util');

const KEY = 'org.names';
const MAX = 200;
const MAX_POSITIONS = 20;
const DEFAULT_COMPANY_NAME = 'Công ty Truyền tải điện 3';
const DEFAULT_UNIT_NAME = 'Đội Sửa chữa, thí nghiệm điện 3';
const DEFAULTS = {
  teamWord: 'Tổ',
  positions: ['Tổ trưởng', 'Tổ phó', 'Kỹ sư', 'Công nhân'],
  leadSignTitle: 'Đội trưởng/ Đội phó',
  roleLabels: { admin: 'Quản trị viên', lead: 'Trưởng/phó đơn vị', member: 'Thành viên' }
};
const ROLES = Object.keys(DEFAULTS.roleLabels);

const clean = (v, max = MAX) => String(v ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanList = (v) => [...new Set((Array.isArray(v) ? v : String(v ?? '').split(/[\n;]/)).map(x => clean(x, 100)).filter(Boolean))].slice(0, MAX_POSITIONS);

/** Giá trị đã lưu -> dạng chuẩn ('' / [] = chưa đặt, dùng mặc định). */
function normalize(v = {}) {
  return {
    companyName: clean(v.companyName),
    unitName: clean(v.unitName),
    teamWord: clean(v.teamWord, 40),
    positions: cleanList(v.positions),
    leadSignTitle: clean(v.leadSignTitle, 100),
    roleLabels: Object.fromEntries(ROLES.map(r => [r, clean(v.roleLabels?.[r], 60)]))
  };
}

/** Giá trị dùng (đã điền mặc định) cho chức danh, tên gọi; tên công ty / đội để headerNames xử lý. */
function effective(v) {
  return {
    teamWord: v.teamWord || DEFAULTS.teamWord,
    positions: v.positions.length ? v.positions : DEFAULTS.positions,
    leadSignTitle: v.leadSignTitle || DEFAULTS.leadSignTitle,
    roleLabels: Object.fromEntries(ROLES.map(r => [r, v.roleLabels[r] || DEFAULTS.roleLabels[r]]))
  };
}

function createOrgNames(db) {
  /** Giá trị admin đã đặt ('' / [] = chưa đặt). */
  async function get() {
    const row = await db.queryOne('SELECT value FROM dkct_settings WHERE name = ?', [KEY]);
    let v = {};
    try { v = row?.value ? JSON.parse(row.value) : {}; } catch { v = {}; }
    return normalize(v);
  }

  /** Lưu các mục gửi lên (mục không gửi giữ nguyên; gửi '' / [] để về mặc định). */
  async function save(input = {}) {
    const value = JSON.stringify(normalize({ ...(await get()), ...input }));
    const res = await db.execute('UPDATE dkct_settings SET value = ?, updatedAt = CURRENT_TIMESTAMP WHERE name = ?', [value, KEY]);
    if (!changedRows(res)) await db.execute('INSERT INTO dkct_settings (name, value) VALUES (?, ?)', [KEY, value]);
    return get();
  }

  /**
   * Tên, chức danh in trên văn bản mới: tên admin đặt, không thì của văn bản gần nhất (lastHeader), không thì mặc định.
   * fallbackUnit: deps.defaultUnitName của ứng dụng chủ (nếu có).
   */
  async function headerNames(lastHeader = {}, fallbackUnit = DEFAULT_UNIT_NAME) {
    const org = await get();
    return {
      companyName: org.companyName || lastHeader.companyName || DEFAULT_COMPANY_NAME,
      unitName: org.unitName || lastHeader.unitName || fallbackUnit || DEFAULT_UNIT_NAME,
      leadSignTitle: effective(org).leadSignTitle
    };
  }

  /** Cho giao diện: giá trị đã đặt, giá trị dùng, mặc định. */
  async function view() {
    const org = await get();
    return { ...org, effective: effective(org), defaults: { companyName: DEFAULT_COMPANY_NAME, unitName: DEFAULT_UNIT_NAME, ...DEFAULTS } };
  }

  return { get, save, headerNames, view };
}

module.exports = { createOrgNames, DEFAULT_COMPANY_NAME, DEFAULT_UNIT_NAME, DEFAULTS };
