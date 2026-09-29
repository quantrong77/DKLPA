const test = require('node:test');
const assert = require('node:assert/strict');
const { vnToday, vnYear, vnNow } = require('../server/services/clock');

test('clock: ngày/năm theo giờ Việt Nam, không phụ thuộc múi giờ máy chủ', () => {
  // 31/12/2026 18:30 UTC = 01/01/2027 01:30 giờ VN
  const d = new Date(Date.UTC(2026, 11, 31, 18, 30));
  assert.equal(vnToday(d), '2027-01-01');
  assert.equal(vnYear(d), 2027);
  assert.equal(vnNow(d), '2027-01-01T01:30');
  assert.equal(vnNow(new Date(Date.UTC(2026, 6, 20, 17, 5))), '2026-07-21T00:05');
});
