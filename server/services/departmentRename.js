/**
 * Đổi tên tổ: tên tổ là khóa trong nhiều bảng (quyền xem hồ sơ, số văn bản, khu vực / trạm phụ trách, người dùng,
 * người nhận Zalo, thiết bị nhận thông báo đẩy) nên đổi tất cả cùng lúc.
 *
 * - Văn bản đã lập giữ tên tổ đã in (dữ liệu văn bản không sửa); tổ vẫn xem, sửa được vì cột department đổi theo.
 * - Số văn bản đánh tiếp (bộ đếm và docDepartment đổi theo), tên viết tắt trong số giấy theo tên viết tắt của tổ.
 * - Không có giao dịch CSDL: đổi lần lượt, đánh dấu đang đổi trong dkct_settings ('department.rename'); lỗi giữa chừng
 *   thì gọi lại cùng tên cũ / tên mới để làm nốt.
 */
const { changedRows } = require('../util');

const MARK = 'department.rename';
// [bảng, cột]: cột lưu tên tổ
const COLUMNS = [
  ['dkct_app_users', 'department'],
  ['dkct_personnel', 'department'],
  ['dkct_works', 'department'],
  ['dkct_surveys', 'department'],
  ['dkct_plans', 'department'], ['dkct_plans', 'docDepartment'],
  ['dkct_registrations', 'department'], ['dkct_registrations', 'docDepartment'],
  ['dkct_confirmations', 'department'], ['dkct_confirmations', 'docDepartment'],
  ['dkct_plan_attachments', 'department'],
  ['dkct_team_areas', 'department'],
  ['dkct_team_stations', 'department'],
  ['dkct_push_subscriptions', 'department'],
  ['dkct_substations', 'teamDepartment']
];
// bộ đếm số văn bản: khóa "<tiền tố><tên tổ>" (giấy ĐKCT không tiền tố, phương án PA:, giấy xác nhận GXN:)
const COUNTER_PREFIXES = ['', 'PA:', 'GXN:'];
const ZALO = 'zalo.config';

const fail = (status, message) => Object.assign(new Error(message), { status });
/** Lỗi do bảng / cột không có (cách gắn không dùng bảng đó): bỏ qua; lỗi khác (mất kết nối…) thì ném tiếp. */
const missing = (err) => ['42P01', '42703', 'ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(err?.code)
  || /no such (table|column)|does not exist|Unknown column|doesn't exist/i.test(String(err?.message));
const clean = (v) => String(v ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();

async function readSetting(db, name) {
  const row = await db.queryOne('SELECT value FROM dkct_settings WHERE name = ?', [name]);
  try { return row?.value ? JSON.parse(row.value) : null; } catch { return null; }
}
async function writeSetting(db, name, obj) {
  const value = JSON.stringify(obj);
  const res = await db.execute('UPDATE dkct_settings SET value = ?, updatedAt = CURRENT_TIMESTAMP WHERE name = ?', [value, name]);
  if (!changedRows(res)) await db.execute('INSERT INTO dkct_settings (name, value) VALUES (?, ?)', [name, value]);
}

/** Tên mới đã có dữ liệu (tổ cũ trùng tên đã xóa, hoặc tổ khác): không gộp hai tổ. -> mô tả chỗ đang dùng | ''. */
async function usedBy(db, name) {
  for (const [table, column] of COLUMNS) {
    try {
      if (await db.queryOne(`SELECT 1 AS x FROM ${table} WHERE ${column} = ? LIMIT 1`, [name])) return `${table}.${column}`;
    } catch (err) { if (!missing(err)) throw err; }
  }
  for (const p of COUNTER_PREFIXES) {
    if (await db.queryOne('SELECT 1 AS x FROM dkct_counters WHERE department = ? LIMIT 1', [`${p}${name}`])) return 'dkct_counters';
  }
  return '';
}

/**
 * Đổi tên tổ from -> to (và tên viết tắt nếu có). -> { from, to, rows: số dòng đã đổi }.
 * departmentsTable: bảng danh sách tổ của ứng dụng chủ (bản độc lập: dkct_app_departments), đổi sau cùng.
 */
async function renameDepartment(db, { from, to, shortName, departmentsTable = 'dkct_app_departments' }) {
  const oldName = clean(from);
  const newName = clean(to).slice(0, 191);
  if (!newName) throw fail(400, 'Nhập tên mới của tổ.');
  if (newName === oldName) throw fail(400, 'Tên mới giống tên cũ.');
  const team = await db.queryOne(`SELECT name FROM ${departmentsTable} WHERE name = ?`, [oldName]);
  const mark = await readSetting(db, MARK);
  const resuming = mark?.from === oldName && mark?.to === newName;
  if (!team && !resuming) throw fail(404, 'Không tìm thấy tổ.');
  if (await db.queryOne(`SELECT name FROM ${departmentsTable} WHERE name = ?`, [newName])) throw fail(409, `Đã có tổ "${newName}".`);
  if (!resuming) {
    const used = await usedBy(db, newName);
    if (used) throw fail(409, `Tên "${newName}" đã từng dùng và còn dữ liệu (${used}). Chọn tên khác.`);
  }

  await writeSetting(db, MARK, { from: oldName, to: newName, at: new Date().toISOString() });
  let rows = 0;
  for (const [table, column] of COLUMNS) {
    try {
      rows += changedRows(await db.execute(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, [newName, oldName]));
    } catch (err) { if (!missing(err)) throw err; } // bảng / cột không có ở cách gắn này
  }
  for (const p of COUNTER_PREFIXES) {
    rows += changedRows(await db.execute('UPDATE dkct_counters SET department = ? WHERE department = ?', [`${p}${newName}`, `${p}${oldName}`]));
  }
  // người nhận Zalo chỉ nhận thay đổi của tổ
  const zalo = await readSetting(db, ZALO);
  if (Array.isArray(zalo?.recipients) && zalo.recipients.some(r => r?.department === oldName)) {
    zalo.recipients = zalo.recipients.map(r => (r?.department === oldName ? { ...r, department: newName } : r));
    await writeSetting(db, ZALO, zalo);
    rows += 1;
  }
  // danh sách tổ sau cùng: lỗi trước đó thì tổ vẫn mang tên cũ, gọi lại để làm nốt
  const sets = ['name = ?'];
  const values = [newName];
  if (clean(shortName)) { sets.push('shortName = ?'); values.push(clean(shortName).slice(0, 64)); }
  rows += changedRows(await db.execute(`UPDATE ${departmentsTable} SET ${sets.join(', ')} WHERE name = ?`, [...values, oldName]));
  await db.execute('DELETE FROM dkct_settings WHERE name = ?', [MARK]);
  return { from: oldName, to: newName, rows };
}

module.exports = { renameDepartment, COLUMNS };
