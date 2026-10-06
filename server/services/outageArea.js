/**
 * Tổ phụ trách dòng lịch cắt điện: theo trạm biến áp ghi trong địa điểm, rồi theo khu vực truyền tải điện (TTĐ).
 *
 * Lịch Công ty không ghi tên tổ, chỉ ghi đơn vị như "TTĐ Lâm Đồng", "Đội SCTN3". Mỗi tổ chọn các khu vực mình phụ trách
 * (bảng dkct_team_areas, tên như "Truyền tải điện Lâm Đồng"). Trạm trong khu vực có thể do tổ khác phụ trách: admin giao
 * riêng trạm cho tổ (bảng dkct_team_substations, theo khóa trạm "220|phanthiet").
 *
 * Địa điểm ghi tự do: "Trạm 220kV Phan Thiết,ĐZ 272/…", "Trạm 220KV KrongBuk", "ĐZ 271 Phước Thái - 273 Tháp Chàm"…
 * Trạm được nhận theo "Trạm/TBA <cấp điện áp>kV <tên>" (không phân biệt dấu, hoa thường, khoảng trắng); địa điểm chỉ có
 * đường dây thì nhận các đầu "<số ngăn> <tên trạm>" là trạm đã biết. Mỗi trạm của dòng lịch:
 *  - giao riêng cho tổ -> tổ đó;
 *  - còn lại -> các tổ phụ trách khu vực của trạm (danh mục TBA), hoặc khu vực ghi ở ô đơn vị ("TTĐ …").
 * Dòng lịch không nhận ra trạm nào -> theo khu vực ở ô đơn vị.
 */

/** "Truyền tải điện Đắk Lắk" / "TTĐ Đắk lăk." -> "dak lak" (bỏ dấu, bỏ tiền tố TTĐ). */
function areaKey(name) {
  const plain = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return plain.replace(/^(truyen tai dien|ttd)\s+/, '').trim();
}

/** Các khu vực ghi trong ô đơn vị: "TTĐ Lâm Đồng; Đội SCTN3" -> ["lam dong"]. */
function areasInUnits(...texts) {
  const out = new Set();
  for (const t of texts) {
    for (const part of String(t || '').split(/[,;\n]+/)) {
      const plain = String(part).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim();
      if (/^(ttd|truyen tai dien)\b/.test(plain.replace(/[^a-z0-9 ]+/g, ''))) {
        const key = areaKey(part);
        if (key) out.add(key);
      }
    }
  }
  return out;
}

/** Bỏ dấu, chữ thường; giữ nguyên độ dài để vị trí khớp được với chuỗi gốc (để lấy lại tên có dấu). */
function plainOf(text) {
  return [...String(text || '').normalize('NFC')].map(c => {
    const p = c.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
    return p.length === 1 ? p : ' ';
  }).join('');
}
const compact = (plain) => plain.replace(/[^a-z0-9]/g, '');
// số ngăn lộ cho biết cấp điện áp: 1xx -> 110kV, 2xx -> 220kV, 5xx -> 500kV
const VOLTAGE_OF_BAY = { 1: '110', 2: '220', 5: '500' };
const STRONG_RE = /\b(?:tram|tba)(?:\s*bien\s*ap)?\s*(\d{2,3})\s*kv\s*([a-z0-9][a-z0-9 _-]*?)\s*(?=[;,.(/]|\bdz\b|\btram\b|\btba\b|$)/g;
const LINE_END_RE = /\b([125])\d{2}\s*[_/]*\s*([a-z][a-z0-9 ]*?)\s*(?=-|[;,]|\.(?:\s|$)|$)/g;

/**
 * Trạm ghi trong địa điểm: { strong: [{ key, label }], weak: [{ key }] }.
 * strong: "Trạm/TBA <U>kV <tên>"; weak: đầu đường dây "<ngăn 2xx/5xx/1xx> <tên>" (chỉ khi không có strong).
 */
function substationsIn(location) {
  const orig = [...String(location || '').normalize('NFC')];
  const plain = plainOf(location);
  const strong = [];
  for (const m of plain.matchAll(STRONG_RE)) {
    const name = compact(m[2]);
    if (!name) continue;
    const at = m.index + m[0].lastIndexOf(m[2]);
    strong.push({ key: `${m[1]}|${name}`, label: `Trạm ${m[1]}kV ${orig.slice(at, at + m[2].length).join('').trim()}` });
  }
  const weak = [];
  if (!strong.length) {
    for (const m of plain.matchAll(LINE_END_RE)) {
      const name = compact(m[2]);
      if (name) weak.push({ key: `${VOLTAGE_OF_BAY[m[1]]}|${name}` });
    }
  }
  return { strong, weak };
}

/** "TBA 220kV Phan Thiết" / "Trạm 220KV  Phan thiet" -> "220|phanthiet" (không nhận ra -> null). */
function subKey(name) {
  const found = substationsIn(name).strong;
  return found.length ? found[0].key : null;
}

/** Khu vực ghi ở ô đơn vị của dòng lịch: Set<areaKey>. */
const unitAreasOf = (o) => areasInUnits(o.registrationUnit, o.workUnit);

/**
 * Bộ xác định tổ phụ trách dòng lịch: (outage) -> Set<department>.
 * @param teamAreas   Map<department, Set<areaKey>> (loadTeamAreas)
 * @param catalog     [{ name, transmissionName }] danh mục TBA (loadAreaSubstations)
 * @param assignments Map<khóa trạm, department> trạm giao riêng (loadTeamSubstations)
 * @param known       khóa trạm đã biết thêm (vd trạm ghi trong lịch) để nhận đầu đường dây
 */
function teamResolver(teamAreas, catalog, assignments = new Map(), known = []) {
  const catalogByKey = new Map();
  for (const s of catalog || []) {
    const k = subKey(s.name);
    if (k && !catalogByKey.has(k)) catalogByKey.set(k, s);
  }
  const knownKeys = new Set([...catalogByKey.keys(), ...assignments.keys(), ...known]);
  const teamsOfAreas = (areas, out) => {
    for (const [dept, keys] of teamAreas) if ([...keys].some(k => areas.has(k))) out.add(dept);
    return out;
  };
  return (o) => {
    const found = substationsIn(o.location);
    let keys = found.strong.map(x => x.key);
    if (!keys.length) keys = found.weak.map(x => x.key).filter(k => knownKeys.has(k));
    const unitAreas = unitAreasOf(o);
    if (!keys.length) return teamsOfAreas(unitAreas, new Set());
    const out = new Set();
    for (const k of new Set(keys)) {
      const owner = assignments.get(k);
      if (owner) { out.add(owner); continue; }
      const sub = catalogByKey.get(k);
      teamsOfAreas(sub?.transmissionName ? new Set([areaKey(sub.transmissionName)]) : unitAreas, out);
    }
    return out;
  };
}

/** Trạm giao riêng: Map<khóa trạm, department>. */
async function loadTeamSubstations(db) {
  const rows = await db.query('SELECT subKey, department FROM dkct_team_substations');
  return new Map(rows.map(r => [r.subKey, r.department]));
}

/** Tổ và khu vực: Map<department, Set<areaKey>>. */
async function loadTeamAreas(db) {
  const rows = await db.query('SELECT department, area FROM dkct_team_areas');
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.department)) map.set(r.department, new Set());
    map.get(r.department).add(areaKey(r.area));
  }
  return map;
}

const loadAreaSubstations = (db) => db.query('SELECT id, name, transmissionName FROM dkct_substations');

/**
 * Tên khu vực để chọn (danh mục TBA + đơn vị "TTĐ …" đã gặp trong lịch), dạng "Truyền tải điện <tên>".
 */
async function areaOptions(db) {
  const names = new Map();
  const add = (label) => { const key = areaKey(label); if (key && !names.has(key)) names.set(key, label); };
  for (const s of await loadAreaSubstations(db)) add(s.transmissionName);
  const units = await db.query('SELECT DISTINCT registrationUnit, workUnit FROM dkct_outages');
  for (const u of units) {
    for (const part of String(`${u.registrationUnit || ''};${u.workUnit || ''}`).split(/[,;\n]+/)) {
      if (areasInUnits(part).size) add(`Truyền tải điện ${part.trim().replace(/^(TTĐ|Truyền tải điện)\s+/i, '').replace(/[.\s]+$/, '')}`);
    }
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'vi'));
}

/**
 * Trạm để giao cho tổ: danh mục TBA + trạm ghi trong lịch cắt điện (kể cả trạm chưa có trong danh mục).
 * -> [{ key, name, area (areaKey), areaLabel, inCatalog, count (số dòng lịch) }]
 */
async function substationChoices(db) {
  const byKey = new Map();
  for (const s of await db.query('SELECT name, transmissionName FROM dkct_substations WHERE active = 1')) {
    const key = subKey(s.name);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, { key, name: s.name, area: s.transmissionName ? areaKey(s.transmissionName) : '', areaLabel: s.transmissionName || '', inCatalog: true, count: 0, areaVotes: new Map() });
  }
  for (const o of await db.query('SELECT location, registrationUnit, workUnit FROM dkct_outages')) {
    const units = [...unitAreasOf(o)];
    for (const { key, label } of substationsIn(o.location).strong) {
      if (!byKey.has(key)) byKey.set(key, { key, name: label, area: '', areaLabel: '', inCatalog: false, count: 0, areaVotes: new Map() });
      const item = byKey.get(key);
      item.count += 1;
      units.forEach(a => item.areaVotes.set(a, (item.areaVotes.get(a) || 0) + 1));
    }
  }
  const labels = new Map((await areaOptions(db)).map(l => [areaKey(l), l]));
  return [...byKey.values()].map(({ areaVotes, ...item }) => {
    if (!item.area && areaVotes.size) item.area = [...areaVotes].sort((a, b) => b[1] - a[1])[0][0];
    if (!item.areaLabel && item.area) item.areaLabel = labels.get(item.area) || `Truyền tải điện ${item.area}`;
    return item;
  });
}

module.exports = {
  areaKey, areasInUnits, subKey, substationsIn, teamResolver,
  loadTeamAreas, loadTeamSubstations, loadAreaSubstations, areaOptions, substationChoices
};
