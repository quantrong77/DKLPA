/**
 * CSDL SQLite trong bộ nhớ có cùng giao diện với server/src/db.js của ChatLan
 * (query / queryOne / execute, tham số "?", isMySQL = false, cùng normalizeSql).
 *
 * DKCT_TEST_DB=postgres: dùng Postgres trong bộ nhớ (PGlite) qua server/pgDb.js — như bản chạy trên Supabase.
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

function createTestDb() {
  if (process.env.DKCT_TEST_DB === 'postgres') return createPgliteDb();
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
