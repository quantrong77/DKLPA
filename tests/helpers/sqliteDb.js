/**
 * CSDL SQLite trong bộ nhớ có cùng giao diện với server/src/db.js của ChatLan
 * (query / queryOne / execute, tham số "?", isMySQL = false, cùng normalizeSql).
 */
const { DatabaseSync } = require('node:sqlite');

function normalizeSql(sql) {
  return sql
    .replace(/INSERT IGNORE INTO/gi, 'INSERT OR IGNORE INTO')
    .replace(/NOW\(\)/gi, "datetime('now', 'localtime')")
    .replace(/CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP/gi, 'CURRENT_TIMESTAMP');
}

function createTestDb() {
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
