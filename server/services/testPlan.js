/**
 * Kế hoạch thí nghiệm định kỳ hằng năm lấy từ Google Sheet (hoặc file .xlsx tải lên): mỗi dòng một thiết bị
 * (trạm, ngăn lộ, mã / tên thiết bị, chu kỳ, kiểm định AT). Đồng bộ về bảng dkct_test_plan_items theo năm; khi lập
 * phương án, lấy các dòng của trạm / ngăn lộ để điền Bảng 1 (hạng mục QĐ 1901) và bảng thiết bị cần thí nghiệm.
 *
 * Mỗi năm một kế hoạch (dkct_settings 'testplan.plans'): link sheet, tên trang tính, năm, cột (chữ cái A, B, …):
 *   station, bay, code, device, include (dòng có khối lượng TNĐK: giá trị includeValue, mặc định 1),
 *   cycles { cột: chu kỳ } (đánh dấu bất kỳ, vd "x"), inspection (kiểm định AT), note, testDate, transmission.
 * Dòng chọn: include = includeValue và có ít nhất một chu kỳ hoặc kiểm định AT được đánh dấu.
 */
const XLSX = require('xlsx');
const { newId } = require('../schema');
const { changedRows } = require('../util');

const PLANS = 'testplan.plans';
// cấu hình cũ (một kế hoạch): đọc thành một năm khi chưa có 'testplan.plans'
const KEY = 'testplan.source';
const STATUS = 'testplan.status';
const MAX_BYTES = 30 * 1024 * 1024;
const BATCH = 200;
const CYCLE_KEYS = ['install', 'year1', 'annual', 'y3', 'y6', 'tc'];
const DEFAULT_SOURCE = {
  url: '',
  sheet: 'Cập nhật 2027',
  year: 2027,
  headerRows: 2,
  columns: {
    transmission: 'B', station: 'C', bay: 'D', code: 'F', device: 'G', include: 'X', includeValue: '1',
    cycles: { H: 'year1', L: 'y3', O: 'y6', P: 'tc' }, inspection: 'Q', note: 'S', testDate: 'T'
  }
};

const fail = (status, message) => Object.assign(new Error(message), { status });
const clean = (v, max = 255) => String(v ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, max);
const LETTER = /^[A-Z]{1,3}$/;
const colIndex = (letter) => [...String(letter).toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Khóa so tên trạm: bỏ dấu, chữ thường, bỏ "TBA"/"trạm biến áp", "220KV" = "220kv". "TBA 220kV Đắk Nông" -> "220kv dak nong". */
function stationKey(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
    .replace(/^\s*(tba|tram bien ap|tram)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
/** Khóa so ngăn lộ: "AT 1" = "at1", "MC 231" = "231". */
const bayKey = (bay) => String(bay || '').trim().toUpperCase().replace(/^(MC|NGĂN|NGAN|MBA)\s*/i, '').replace(/[\s.]/g, '');

/**
 * Cấp điện áp ≥ 110kV theo số hiệu ngăn: 5xx / 2xx / 1xx, thanh cái C5x / C2x / C1x, ngăn MBA (AT…), kháng (KH5xx),
 * xuất tuyến 5xx (XT574); còn lại (3xx, 4xx, 9xx, C3x, C4x…) ≤ 35kV.
 */
const highVoltage = (bay) => /^(?:XT|KH)?[125]\d\d|^C[125]\d|^AT/.test(bayKey(bay));

/**
 * Loại thiết bị QĐ 1901 (tests1901.json) theo mã (cột Mã TB) / tên / ngăn lộ; '' nếu không có bảng QĐ 1901
 * (rơle, nhị thứ, accu, cáp, PD…). Chọn theo cấp điện áp khi một loại có nhiều kiểu; người lập đổi lại được.
 */
function deviceKeyOf(code, name, bay) {
  const c = String(code || '').trim().toUpperCase();
  const n = String(name || '').toUpperCase();
  if (c === 'MB') return /TỰ DÙNG|TD/.test(n) ? 'MBA_TD' : 'MBA';
  if (c === 'TD') return 'MBA_TD';
  if (c === 'MC') return /DẦU/.test(n) ? 'MC_DAU' : /CHÂN KHÔNG/.test(n) || !highVoltage(bay) ? 'MC_CK' : 'MC_SF6';
  if (c === 'TI') return /SF6/.test(n) ? 'TI_SF6' : highVoltage(bay) ? 'TI_DAU' : 'TI_35';
  if (c === 'TU') return highVoltage(bay) ? 'TU_TU' : 'TU_CD';
  if (c === 'DC') return 'DCL';
  if (c === 'CS') return 'CSV';
  if (c === 'KH') return 'KH';
  if (c === 'KK') return 'KK';
  // tụ bù dọc: không có bảng QĐ 1901, có trong danh sách chọn bảng thiết bị (client/lib/plan.js EXTRA_EQUIPMENT)
  if (c === 'TB' || /^TBD(?![A-Z0-9])/.test(n)) return 'TBD';
  return '';
}

/** Link Google Sheet (…/edit…) -> link tải cả file .xlsx; link khác giữ nguyên. */
function exportUrl(url) {
  const m = String(url || '').match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
  return m ? `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=xlsx` : String(url || '');
}

function normalizeSource(input = {}) {
  const d = DEFAULT_SOURCE;
  const c = input.columns || {};
  const letter = (v, fallback) => (LETTER.test(String(v ?? '').toUpperCase()) ? String(v).toUpperCase() : v === '' ? '' : fallback);
  const cycles = {};
  for (const [col, cycle] of Object.entries(c.cycles && typeof c.cycles === 'object' ? c.cycles : d.columns.cycles)) {
    if (LETTER.test(String(col).toUpperCase()) && CYCLE_KEYS.includes(cycle)) cycles[String(col).toUpperCase()] = cycle;
  }
  const year = Number.parseInt(input.year, 10);
  return {
    url: clean(input.url ?? d.url, 1000),
    sheet: clean(input.sheet ?? d.sheet, 100),
    year: year >= 2000 && year <= 2100 ? year : d.year,
    headerRows: Math.max(0, Math.min(20, Number.parseInt(input.headerRows ?? d.headerRows, 10) || 0)),
    columns: {
      transmission: letter(c.transmission, d.columns.transmission), station: letter(c.station, d.columns.station),
      bay: letter(c.bay, d.columns.bay), code: letter(c.code, d.columns.code), device: letter(c.device, d.columns.device),
      include: letter(c.include, d.columns.include), includeValue: clean(c.includeValue ?? d.columns.includeValue, 20),
      cycles, inspection: letter(c.inspection, d.columns.inspection), note: letter(c.note, d.columns.note),
      testDate: letter(c.testDate, d.columns.testDate)
    }
  };
}

// ô đánh dấu: "x", "X", "✓", "KĐ", TRUE…; ô số (dòng tổng cộng ghi số đếm) hoặc 0 không tính
const marked = (v) => {
  const s = String(v ?? '').trim();
  return !!s && !/^\d+([.,]\d+)?$/.test(s) && !/^(false|no|không)$/i.test(s);
};

/** Đọc file .xlsx theo cấu hình -> { items, report }. */
function parseWorkbook(buffer, source) {
  let wb;
  try { wb = XLSX.read(buffer, { type: 'buffer', cellDates: false }); } catch { throw fail(422, 'Không đọc được file kế hoạch (cần file Excel .xlsx).'); }
  const name = wb.SheetNames.find(n => n.trim().toLowerCase() === source.sheet.trim().toLowerCase());
  if (!name) throw fail(422, `Không thấy trang tính "${source.sheet}". Các trang có: ${wb.SheetNames.join(', ')}.`);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false });
  const col = (row, letter) => (letter ? clean(row[colIndex(letter)], 500) : '');
  const c = source.columns;
  const items = [];
  const stations = new Map();
  let considered = 0;
  rows.slice(source.headerRows).forEach((row, i) => {
    const station = col(row, c.station);
    const device = col(row, c.device);
    if (!station || !device) return;
    considered += 1;
    if (c.include && col(row, c.include) !== c.includeValue) return;
    const cycles = Object.entries(c.cycles).filter(([letter]) => marked(row[colIndex(letter)])).map(([, cycle]) => cycle);
    const inspection = c.inspection ? marked(row[colIndex(c.inspection)]) : false;
    if (!cycles.length && !inspection) return;
    const bay = col(row, c.bay);
    const code = col(row, c.code);
    items.push({
      rowNo: i + source.headerRows + 1, transmission: col(row, c.transmission), stationName: station, stationKey: stationKey(station),
      bay, bayKey: bayKey(bay), deviceCode: code.slice(0, 20), deviceName: device.slice(0, 255), deviceKey: deviceKeyOf(code, device, bay),
      cycles: [...new Set(cycles)], inspection, note: col(row, c.note), testDate: col(row, c.testDate).slice(0, 16)
    });
    stations.set(station, (stations.get(station) || 0) + 1);
  });
  return {
    items,
    report: {
      sheet: name, rows: considered, selected: items.length,
      stations: [...stations].map(([n, count]) => ({ name: n, count })).sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    }
  };
}

function createTestPlan({ db, fetch = globalThis.fetch }) {
  async function read(name) {
    const row = await db.queryOne('SELECT value FROM dkct_settings WHERE name = ?', [name]);
    try { return row?.value ? JSON.parse(row.value) : null; } catch { return null; }
  }
  async function write(name, obj) {
    const value = JSON.stringify(obj);
    const res = await db.execute('UPDATE dkct_settings SET value = ?, updatedAt = CURRENT_TIMESTAMP WHERE name = ?', [value, name]);
    if (!changedRows(res)) await db.execute('INSERT INTO dkct_settings (name, value) VALUES (?, ?)', [name, value]);
  }

  /**
   * Kế hoạch các năm (dkct_settings 'testplan.plans'): [{ year, url, sheet, headerRows, columns, status }], năm mới trước.
   * Cấu hình cũ một kế hoạch ('testplan.source' + 'testplan.status') đọc thành một năm.
   */
  async function plans() {
    let list = await read(PLANS);
    if (!Array.isArray(list)) {
      const old = await read(KEY);
      list = old ? [{ ...old, status: (await read(STATUS)) || null }] : [];
    }
    return list.map(p => ({ ...normalizeSource(p), status: p.status || null })).sort((x, y) => y.year - x.year);
  }
  const planOf = async (year) => (await plans()).find(p => p.year === Number(year)) || null;

  /**
   * Thêm / sửa kế hoạch năm `year`. Năm mới: chép cột, số dòng tiêu đề của kế hoạch gần nhất, trang tính "Cập nhật <năm>".
   * Đổi năm (input.year khác): chuyển các dòng đã đồng bộ sang năm mới. -> kế hoạch đã lưu
   */
  async function savePlan(year, input = {}) {
    const y = Number.parseInt(year, 10);
    if (!(y >= 2000 && y <= 2100)) throw fail(400, 'Năm kế hoạch không hợp lệ.');
    const list = await plans();
    const current = list.find(p => p.year === y);
    const target = Number.parseInt(input.year ?? y, 10);
    const base = current || (list[0] ? { headerRows: list[0].headerRows, columns: list[0].columns, url: '', sheet: `Cập nhật ${target}` } : { sheet: `Cập nhật ${target}` });
    const next = normalizeSource({ ...base, ...input, year: target });
    if (next.year !== y && list.some(p => p.year === next.year)) throw fail(409, `Đã có kế hoạch năm ${next.year}.`);
    if (current && next.year !== y) await db.execute('UPDATE dkct_test_plan_items SET year = ? WHERE year = ?', [next.year, y]);
    const entry = { ...next, status: current?.status ? { ...current.status, year: next.year } : null };
    await write(PLANS, [...list.filter(p => p.year !== y), entry]);
    return entry;
  }

  /** Xóa kế hoạch một năm cùng các dòng đã đồng bộ (phương án đã lập giữ nguyên nội dung). */
  async function deletePlan(year) {
    const list = await plans();
    const y = Number(year);
    if (!list.some(p => p.year === y)) throw fail(404, `Không có kế hoạch năm ${year}.`);
    await db.execute('DELETE FROM dkct_test_plan_items WHERE year = ?', [y]);
    await write(PLANS, list.filter(p => p.year !== y));
  }

  /** Tải file từ link (Google Sheet: phải chia sẻ "Bất kỳ ai có đường liên kết đều xem được"). */
  async function download(url) {
    const target = exportUrl(url);
    if (!/^https:\/\//.test(target)) throw fail(400, 'Nhập link Google Sheet (https://docs.google.com/spreadsheets/…).');
    let res;
    try { res = await fetch(target, { redirect: 'follow' }); } catch (err) { throw fail(502, `Không tải được kế hoạch: ${err.message}`); }
    const type = res.headers.get('content-type') || '';
    if (res.status === 401 || res.status === 403 || /text\/html/.test(type)) {
      throw fail(422, 'Google Sheet chưa cho xem bằng link: mở sheet → Chia sẻ → "Bất kỳ ai có đường liên kết" → Người xem; hoặc tải file .xlsx lên.');
    }
    if (!res.ok) throw fail(502, `Không tải được kế hoạch (HTTP ${res.status}).`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw fail(413, 'File kế hoạch quá lớn.');
    return buf;
  }

  /** Đồng bộ kế hoạch năm `year`: file (Buffer) hoặc tải theo link đã lưu; thay toàn bộ dòng của năm đó. -> trạng thái */
  async function sync(year, { buffer, actorId, fileName } = {}) {
    const s = await planOf(year);
    if (!s) throw fail(404, `Chưa có kế hoạch năm ${year}: thêm kế hoạch năm trước khi đồng bộ.`);
    const buf = buffer || await download(s.url);
    const { items, report } = parseWorkbook(buf, s);
    await db.execute('DELETE FROM dkct_test_plan_items WHERE year = ?', [s.year]);
    // ghi theo lô (CSDL ở xa: mỗi lệnh một lượt mạng; ~2000 dòng/năm)
    const marks = `(${Array(15).fill('?').join(', ')})`;
    for (let i = 0; i < items.length; i += BATCH) {
      const chunk = items.slice(i, i + BATCH);
      await db.execute(`INSERT INTO dkct_test_plan_items (id, year, rowNo, transmission, stationName, stationKey, bay, bayKey,
        deviceCode, deviceName, deviceKey, cycles, inspection, note, testDate) VALUES ${chunk.map(() => marks).join(', ')}`,
      chunk.flatMap(it => [newId('KH'), s.year, it.rowNo, it.transmission.slice(0, 191), it.stationName.slice(0, 255), it.stationKey.slice(0, 191),
        it.bay.slice(0, 100), it.bayKey.slice(0, 100), it.deviceCode, it.deviceName, it.deviceKey, JSON.stringify(it.cycles),
        it.inspection ? 1 : 0, it.note.slice(0, 1000), it.testDate]));
    }
    const st = { ...report, year: s.year, from: buffer ? (fileName || 'file tải lên') : 'link Google Sheet', at: new Date().toISOString(), by: actorId || null };
    const list = await plans();
    await write(PLANS, list.map(p => (p.year === s.year ? { ...p, status: st } : p)));
    return st;
  }

  /**
   * Dòng kế hoạch của một trạm (so tên bỏ dấu) theo năm: năm hỏi nếu có kế hoạch năm đó, không thì năm gần nhất.
   * -> { year, years, syncedAt, items }
   */
  async function itemsOf({ station, year } = {}) {
    const list = await plans();
    const plan = list.find(p => p.year === Number(year)) || list[0] || null;
    const key = stationKey(station);
    const out = { year: plan?.year || null, years: list.map(p => p.year), syncedAt: plan?.status?.at || null, items: [] };
    if (!key || !plan) return out;
    const rows = await db.query('SELECT * FROM dkct_test_plan_items WHERE year = ? AND stationKey = ? ORDER BY rowNo', [plan.year, key]);
    out.items = rows.map(r => ({ ...r, inspection: !!Number(r.inspection), cycles: (() => { try { return JSON.parse(r.cycles || '[]'); } catch { return []; } })() }));
    return out;
  }

  return { plans, savePlan, deletePlan, sync, itemsOf };
}

module.exports = { createTestPlan, parseWorkbook, normalizeSource, stationKey, bayKey, deviceKeyOf, exportUrl, DEFAULT_SOURCE, CYCLE_KEYS };
