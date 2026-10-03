/**
 * Khu vực truyền tải điện (TTĐ) của dòng lịch cắt điện, để biết dòng lịch thuộc tổ nào.
 *
 * Lịch Công ty không ghi tên tổ, chỉ ghi đơn vị như "TTĐ Lâm Đồng", "Đội SCTN3". Mỗi tổ chọn các khu vực mình phụ trách
 * (bảng dkct_team_areas, tên như "Truyền tải điện Lâm Đồng"). Dòng lịch thuộc khu vực nếu:
 *  - ô đơn vị đăng ký / đơn vị công tác có "TTĐ <khu vực>" (viết tắt hay đầy đủ, có dấu hay không), hoặc
 *  - địa điểm là một TBA trong danh mục có "Truyền tải điện" là khu vực đó.
 */
const { sameUnitName } = require('../schema');

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

/**
 * Bộ xác định khu vực của dòng lịch: (outage) -> Set<areaKey>.
 * `substations`: [{ name, transmissionName }] trong danh mục.
 */
function areaResolver(substations) {
  const subs = (substations || []).filter(s => s.transmissionName);
  return (o) => {
    const keys = areasInUnits(o.registrationUnit, o.workUnit);
    const sub = subs.find(s => sameUnitName(s.name, o.location));
    if (sub) keys.add(areaKey(sub.transmissionName));
    return keys;
  };
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

const loadAreaSubstations = (db) => db.query('SELECT name, transmissionName FROM dkct_substations WHERE transmissionName IS NOT NULL');

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

module.exports = { areaKey, areasInUnits, areaResolver, loadTeamAreas, loadAreaSubstations, areaOptions };
