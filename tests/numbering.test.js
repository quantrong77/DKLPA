const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers/sqliteDb');
const { migrate } = require('../server/schema');
const { createNumbering } = require('../server/services/numbering');

test('takeNext bỏ qua các số module cũ đã cấp sau khi bộ đếm mới được tạo', async () => {
  const db = createTestDb();
  await migrate(db);
  let legacy = 10;
  const n = createNumbering(db, async () => legacy);
  assert.equal(await n.takeNext('TNLĐ', 2026), 11);
  legacy = 14; // có người lập giấy bằng module cũ
  assert.equal(await n.takeNext('TNLĐ', 2026), 15);
  assert.equal(await n.takeNext('TNLĐ', 2026), 16);
  db.close();
});
