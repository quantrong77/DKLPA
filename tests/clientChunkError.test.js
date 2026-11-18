const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../client/lib/chunkError.js');

test('isChunkError: nhận lỗi tải phần nạp trễ của Chrome/Firefox/Safari/webpack, bỏ qua lỗi thường', async () => {
  const { isChunkError } = await load();
  assert.equal(isChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/PlanEditor-abc.js')), true);
  assert.equal(isChunkError(new TypeError('error loading dynamically imported module')), true);
  assert.equal(isChunkError(new TypeError('Importing a module script failed.')), true);
  assert.equal(isChunkError(new Error('Loading chunk 42 failed.')), true);
  assert.equal(isChunkError(Object.assign(new Error('x'), { name: 'ChunkLoadError' })), true);
  assert.equal(isChunkError('Failed to fetch dynamically imported module'), true);
  assert.equal(isChunkError(new ReferenceError('ClipboardList is not defined')), false);
  assert.equal(isChunkError(null), false);
  assert.equal(isChunkError(undefined), false);
});
