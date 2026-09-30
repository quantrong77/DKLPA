/**
 * Danh sách địa danh cho dòng "<địa danh>, ngày … tháng … năm …" của phương án.
 * Mặc định Lâm Đồng, Khánh Hòa; địa danh mới người dùng gõ được nhớ lại (dkct_settings, dùng chung mọi tổ).
 */
const DEFAULT_PLACE = 'Lâm Đồng';
const DEFAULT_PLACES = [DEFAULT_PLACE, 'Khánh Hòa'];
const KEY = 'places';
const MAX = 50;

const clean = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 100);
const same = (a, b) => clean(a).toLocaleLowerCase('vi') === clean(b).toLocaleLowerCase('vi');

function createPlaces(db) {
  async function saved() {
    const row = await db.queryOne('SELECT value FROM dkct_settings WHERE name = ?', [KEY]);
    try { const list = JSON.parse(row?.value || '[]'); return Array.isArray(list) ? list.map(clean).filter(Boolean) : []; } catch { return []; }
  }

  async function list() {
    const out = [...DEFAULT_PLACES];
    for (const p of await saved()) if (!out.some(x => same(x, p))) out.push(p);
    return out;
  }

  /** Nhớ địa danh mới (bỏ qua rỗng hoặc đã có). */
  async function remember(place) {
    const p = clean(place);
    if (!p || p.includes('..') || DEFAULT_PLACES.some(x => same(x, p))) return;
    const current = await saved();
    if (current.some(x => same(x, p))) return;
    const value = JSON.stringify([...current, p].slice(-MAX));
    const updated = await db.execute('UPDATE dkct_settings SET value = ?, updatedAt = CURRENT_TIMESTAMP WHERE name = ?', [value, KEY]);
    if (!Number(updated?.changes ?? updated?.affectedRows)) {
      await db.execute('INSERT INTO dkct_settings (name, value) VALUES (?, ?)', [KEY, value]);
    }
  }

  return { list, remember };
}

module.exports = { createPlaces, DEFAULT_PLACE, DEFAULT_PLACES };
