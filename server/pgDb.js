/**
 * CSDL Postgres (Supabase) có cùng giao diện với server/src/db.js của ChatLan:
 * query / queryOne / execute, tham số "?", isMySQL = false, dialect = 'postgres'.
 *
 * client: bất kỳ đối tượng nào có query(text, params) -> { rows, rowCount | affectedRows }
 * (pg.Pool khi chạy thật, PGlite khi chạy test).
 *
 * Các khác biệt với MySQL/SQLite được xử lý ở đây, để SQL của module giữ nguyên:
 *  - "?" -> $1, $2, … (bỏ qua "?" trong chuỗi '...');
 *  - "INSERT IGNORE INTO" -> "INSERT INTO … ON CONFLICT DO NOTHING";
 *  - LIKE -> ILIKE (MySQL/SQLite so khớp không phân biệt hoa/thường);
 *  - Postgres hạ tên cột không đặt trong ngoặc kép thành chữ thường ("docNumber" -> "docnumber"):
 *    tên khóa của dòng kết quả được trả lại đúng dạng camelCase theo từ điển tên cột;
 *  - BIGINT (COUNT(*)) -> number, TIMESTAMP -> chuỗi "YYYY-MM-DD HH:MM:SS" như SQLite,
 *    BYTEA -> Buffer.
 */

function toPositional(sql) {
  let out = '';
  let n = 0;
  let quoted = false;
  for (const ch of sql) {
    if (ch === "'") quoted = !quoted;
    out += ch === '?' && !quoted ? `$${++n}` : ch;
  }
  return out;
}

function normalizeSql(sql) {
  let s = sql.trim();
  if (/^INSERT IGNORE INTO/i.test(s)) s = `${s.replace(/^INSERT IGNORE INTO/i, 'INSERT INTO')} ON CONFLICT DO NOTHING`;
  s = s.replace(/\bLIKE\b/g, 'ILIKE');
  return toPositional(s);
}

const CAMEL = /\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/g;

/** Từ điển chữ thường -> camelCase, lấy từ các văn bản (định nghĩa bảng, câu SQL). */
function nameDictionary(...texts) {
  const dict = new Map();
  for (const text of texts) for (const name of String(text).match(CAMEL) || []) dict.set(name.toLowerCase(), name);
  return dict;
}

const pad = (n) => String(n).padStart(2, '0');
const sqlTime = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;

function plainValue(v) {
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof Date) return sqlTime(v);
  if (v instanceof Uint8Array && !Buffer.isBuffer(v)) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  return v;
}

function createPgDb(client, { names = [] } = {}) {
  const base = nameDictionary(require('./schema').COLUMN_TEXT, ...names);
  const restore = (sql) => {
    const local = nameDictionary(sql);
    return (row) => {
      const out = {};
      for (const [k, v] of Object.entries(row)) out[local.get(k) || base.get(k) || k] = plainValue(v);
      return out;
    };
  };
  const run = (sql, params = []) => client.query(normalizeSql(sql), params.map(p => (p === undefined ? null : p)));
  return {
    isMySQL: false,
    dialect: 'postgres',
    async query(sql, params) { return (await run(sql, params)).rows.map(restore(sql)); },
    async queryOne(sql, params) { const [row] = await this.query(sql, params); return row || null; },
    async execute(sql, params) {
      const res = await run(sql, params);
      return { changes: Number(res.rowCount ?? res.affectedRows ?? 0), rows: res.rows };
    }
  };
}

module.exports = { createPgDb, normalizeSql, nameDictionary };
