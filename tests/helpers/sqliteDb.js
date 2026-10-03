/**
 * CSDL SQLite trong bộ nhớ có cùng giao diện với server/src/db.js của ChatLan
 * (query / queryOne / execute, tham số "?", isMySQL = false, cùng normalizeSql).
 *
 * DKCT_TEST_DB=postgres: dùng Postgres trong bộ nhớ (PGlite) qua server/pgDb.js — như bản chạy trên Supabase.
 * DKCT_TEST_DB=mysql: dùng máy chủ MySQL thật như ChatLan (mysql2, pool.query) — mỗi ứng dụng thử một CSDL tạm
 *   dkct_t_<ngẫu nhiên>, xóa khi đóng. Kết nối: DKCT_TEST_MYSQL_HOST / _PORT / _USER / _PASSWORD
 *   (đặt trong tests/mysql.local.env, không commit).
 */
const { DatabaseSync } = require('node:sqlite');

function normalizeSql(sql) {
  return sql
    .replace(/INSERT IGNORE INTO/gi, 'INSERT OR IGNORE INTO')
    .replace(/NOW\(\)/gi, "datetime('now', 'localtime')")
    .replace(/CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP/gi, 'CURRENT_TIMESTAMP');
}

function createPgliteDb() {
  const { PGlite } = require('@electric-sql/pglite');
  const { createPgDb } = require('../../server/pgDb');
  // giống pg.Pool của bản chạy thật (standalone/server): TIMESTAMP giữ dạng chuỗi, BIGINT -> number
  const pg = new PGlite({ parsers: { 1114: (v) => v, 20: Number } });
  return Object.assign(createPgDb(pg), { close: () => pg.close() });
}

function createMysqlDb() {
  const mysql = require('mysql2/promise');
  const env = process.env;
  const conn = {
    host: env.DKCT_TEST_MYSQL_HOST || '127.0.0.1',
    port: Number(env.DKCT_TEST_MYSQL_PORT || 3306),
    user: env.DKCT_TEST_MYSQL_USER || 'root',
    password: env.DKCT_TEST_MYSQL_PASSWORD || ''
  };
  const name = `dkct_t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  // tạo CSDL tạm lần đầu dùng (createTestDb đồng bộ); pool giống ChatLan (utf8mb4, không dateStrings)
  let pool = null;
  const ready = (async () => {
    const admin = await mysql.createConnection(conn);
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.end();
    pool = mysql.createPool({ ...conn, database: name, connectionLimit: 5, charset: 'utf8mb4' });
  })();
  const run = async (sql, params) => { await ready; const [rows] = await pool.query(sql, params); return rows; };
  return {
    isMySQL: true,
    async query(sql, params = []) { return run(sql, params); },
    async queryOne(sql, params = []) { const rows = await run(sql, params); return rows && rows.length ? rows[0] : null; },
    async execute(sql, params = []) { return run(sql, params); },
    async close() {
      await ready.catch(() => {});
      if (pool) { await pool.query(`DROP DATABASE IF EXISTS \`${name}\``).catch(() => {}); await pool.end(); }
    }
  };
}

function createTestDb() {
  if (process.env.DKCT_TEST_DB === 'postgres') return createPgliteDb();
  if (process.env.DKCT_TEST_DB === 'mysql') return createMysqlDb();
  const sDb = new DatabaseSync(':memory:');
  const plain = (row) => (row ? { ...row } : null);
  return {
    isMySQL: false,
    async query(sql, params = []) { return sDb.prepare(normalizeSql(sql)).all(...params).map(plain); },
    async queryOne(sql, params = []) { return plain(sDb.prepare(normalizeSql(sql)).get(...params)); },
    async execute(sql, params = []) { return sDb.prepare(normalizeSql(sql)).run(...params); },
    close() { sDb.close(); }
  };
}

module.exports = { createTestDb };
