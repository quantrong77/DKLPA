const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../client/lib/theme.js');
const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('theme: mặc định khi chưa chọn / giá trị lạ / bộ nhớ lỗi; lưu rồi đọc lại; lớp CSS theo giao diện', async () => {
  const { THEMES, loadTheme, saveTheme, themeClass } = await load();
  assert.deepEqual(THEMES.map(t => t.id), ['evnnpt', 'default', 'pro']);
  const s = memory();
  assert.equal(loadTheme(s), 'evnnpt');
  assert.equal(loadTheme(null), 'evnnpt');
  assert.equal(loadTheme({ getItem() { throw new Error('blocked'); } }), 'evnnpt');
  s.setItem('dkct.theme', 'khong-co');
  assert.equal(loadTheme(s), 'evnnpt');
  saveTheme(s, 'pro');
  assert.equal(loadTheme(s), 'pro');
  assert.doesNotThrow(() => saveTheme({ setItem() { throw new Error('quota'); } }, 'pro'));
  assert.equal(themeClass('pro'), 'dkct-theme-pro');
  assert.equal(themeClass('default'), '');
  assert.equal(themeClass('evnnpt'), 'dkct-theme-evnnpt');
  assert.equal(themeClass('la'), 'dkct-theme-evnnpt');
});
