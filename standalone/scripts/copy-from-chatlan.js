/**
 * Chép dữ liệu module ĐKCT từ CSDL ChatLan (MySQL, vd chatlan_dkct_test) sang Postgres của Supabase.
 *
 *   node standalone/scripts/copy-from-chatlan.js <đường dẫn .env của ChatLan> [--force]
 *
 * - Nguồn: DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME trong .env của ChatLan (chỉ đọc).
 * - Đích: DATABASE_URL trong standalone/.env.
 * - Chép mọi bảng dkct_* (danh mục, bản vẽ, lịch, biên bản, phương án, giấy, bộ đếm số) trong một giao dịch:
 *   lỗi giữa chừng thì đích giữ nguyên. Danh mục mặc định ở đích được thay bằng danh mục của ChatLan.
 * - Tạo sẵn các tổ (mọi "Tổ …" và tổ đang có hồ sơ; tên + viết tắt lấy từ ChatLan) để admin chỉ cần xếp người vào tổ.
 * - Đích đã có hồ sơ (lịch, biên bản, phương án, giấy, bản vẽ) thì dừng, trừ khi thêm --force (ghi đè).
 */
const path = require('node:path');

// Thứ tự chèn theo khóa ngoại; xóa theo thứ tự ngược lại
const TABLES = [
  'dkct_stations', 'dkct_substations', 'dkct_drawings', 'dkct_personnel', 'dkct_duties', 'dkct_risks',
  'dkct_outages', 'dkct_works', 'dkct_surveys', 'dkct_plans', 'dkct_registrations', 'dkct_confirmations',
  'dkct_counters', 'dkct_settings'
];
// bảng có từ bản sau: ChatLan chưa cập nhật module thì chưa có, coi như trống
const OPTIONAL_TABLES = new Set(['dkct_works']);
const RECORD_TABLES = ['dkct_outages', 'dkct_works', 'dkct_surveys', 'dkct_plans', 'dkct_registrations', 'dkct_confirmations', 'dkct_drawings'];
const DEPARTMENT_SOURCES = ['dkct_registrations', 'dkct_plans', 'dkct_surveys', 'dkct_confirmations', 'dkct_personnel'];

const plain = (v) => (v instanceof Uint8Array && !Buffer.isBuffer(v) ? Buffer.from(v) : v);

/**
 * source: { query(sql) -> rows } (MySQL/SQLite của ChatLan)
 * target: CSDL Postgres dạng pgDb (query/queryOne/execute) đang ở trong giao dịch
 */
async function copyAll({ source, target, force = false, log = () => {} }) {
  const existing = [];
  for (const t of RECORD_TABLES) {
    const row = await target.queryOne(`SELECT COUNT(*) AS n FROM ${t}`);
    if (Number(row?.n) > 0) existing.push(`${t}: ${row.n}`);
  }
  if (existing.length && !force) {
    throw new Error(`Supabase đã có hồ sơ (${existing.join(', ')}). Chạy lại với --force để ghi đè bằng dữ liệu ChatLan.`);
  }

  const counts = {};
  for (const t of [...TABLES].reverse()) await target.execute(`DELETE FROM ${t}`);
  for (const t of TABLES) {
    const targetCols = new Set((await target.query(
      'SELECT column_name AS c FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?', [t]
    )).map(r => r.c.toLowerCase()));
    const rows = await source.query(`SELECT * FROM ${t}`).catch(e => (OPTIONAL_TABLES.has(t) ? [] : Promise.reject(e)));
    for (const row of rows) {
      const cols = Object.keys(row).filter(c => targetCols.has(c.toLowerCase()));
      await target.execute(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        cols.map(c => plain(row[c])));
    }
    counts[t] = rows.length;
    log(`${t.padEnd(20)} ${rows.length}`);
  }

  // Tổ đang có hồ sơ -> bảng tổ của ứng dụng độc lập (giữ tên viết tắt dùng trong số giấy)
  const used = new Set();
  for (const t of DEPARTMENT_SOURCES) {
    for (const r of await source.query(`SELECT DISTINCT department FROM ${t}`)) if (r.department) used.add(r.department);
  }
  for (const r of await source.query('SELECT department FROM dkct_counters')) {
    const name = String(r.department).replace(/^(PA:|GXN:)/, ''); // khóa bộ đếm có tiền tố theo loại văn bản
    if (name) used.add(name);
  }
  // cùng mọi "Tổ …" của ChatLan (như ô "Tổ đăng ký" trong ChatLan) để admin có sẵn danh sách tổ
  for (const r of await source.query("SELECT name FROM departments WHERE name LIKE 'Tổ %'")) used.add(r.name);
  const departments = [];
  for (const name of used) {
    const d = (await source.query('SELECT name, shortName FROM departments WHERE name = ?', [name]))[0];
    await target.execute('INSERT IGNORE INTO dkct_app_departments (name, shortName) VALUES (?, ?)', [name, d?.shortName || name]);
    departments.push(`${name} (${d?.shortName || '?'})`);
  }
  log(`Tổ: ${departments.join('; ') || '(không có)'}`);
  return { counts, departments };
}

async function main() {
  const [envPath, ...flags] = process.argv.slice(2);
  if (!envPath) {
    console.error('Cách dùng: node standalone/scripts/copy-from-chatlan.js <.env của ChatLan> [--force]');
    process.exit(1);
  }
  const sourceEnv = {};
  for (const line of require('node:fs').readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) sourceEnv[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch { /* dùng biến môi trường */ }
  if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL (standalone/.env).');

  const mysql = require('mysql2/promise');
  const { Pool, types } = require('pg');
  const { createPgDb } = require('../../server/pgDb');
  const { createApp, APP_TABLE_TEXT } = require('../server/app');
  types.setTypeParser(1114, (v) => v);
  types.setTypeParser(20, (v) => Number(v));

  const my = await mysql.createConnection({
    host: sourceEnv.DB_HOST, port: Number(sourceEnv.DB_PORT) || 3306, user: sourceEnv.DB_USER,
    password: sourceEnv.DB_PASSWORD, database: sourceEnv.DB_NAME, dateStrings: true, charset: 'utf8mb4'
  });
  console.log(`Nguồn: MySQL ${sourceEnv.DB_NAME} @ ${sourceEnv.DB_HOST}`);
  const source = { query: async (sql, params) => (await my.query(sql, params))[0] };

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
  const client = await pool.connect();
  const target = createPgDb(client, { names: [APP_TABLE_TEXT] });
  try {
    // tạo bảng (như khi server khởi động), rồi chép trong một giao dịch
    await createApp({ db: target, verifyToken: async () => null }).migrate();
    await client.query('BEGIN');
    await copyAll({ source, target, force: flags.includes('--force'), log: console.log });
    await client.query('COMMIT');
    console.log('Xong. Đăng nhập ứng dụng, vào Quản trị để xếp người vào tổ.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
    await my.end();
  }
}

if (require.main === module) {
  main().catch((err) => { console.error(`Lỗi: ${err.message}`); process.exit(1); });
}

module.exports = { copyAll, TABLES };
