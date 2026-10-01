/**
 * Thư viện cô lập mạch dòng (Phụ lục II của phương án) — quy tắc thuần, không truy cập DB.
 *
 * Mỗi biến dòng (TI) có nhiều core; mỗi core in 6 dòng: L1 (kẹp 1, 4), L2 (2, 5), L3 (3, 6) tại tủ trung gian,
 * mỗi dòng kèm đầu phía CT đúng nhãn trên bản vẽ (đầu cuộn có đấu dây, vd 1S1/1S4). Điểm N không in.
 * Không suy diễn: ô không xác định được để null và báo "CHƯA ĐỦ DỮ LIỆU" để kỹ sư kiểm tra.
 */
const { text } = require('./registration');

const INSUFFICIENT = 'CHƯA ĐỦ DỮ LIỆU';
/** Thứ tự 6 dòng mỗi core như mẫu: pha và số thứ tự hàng kẹp trong khối. */
const ROWS = [
  { phase: 'L1', terminal: 1 }, { phase: 'L1', terminal: 4 },
  { phase: 'L2', terminal: 2 }, { phase: 'L2', terminal: 5 },
  { phase: 'L3', terminal: 3 }, { phase: 'L3', terminal: 6 }
];
const MAX_CORES = 20;
const STATUSES = ['DRAFT', 'VERIFIED'];

const short = (v, max = 40) => text(v).slice(0, max);
const intIn = (v, min, max) => {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** "x41 - 1", "XA1:4", "X41.2" -> "X41-1", "XA1-4", "X41-2"; rỗng -> null. */
function normalizeTerminal(v) {
  const s = text(v).toUpperCase().replace(/\s+/g, '').replace(/[:.]/g, '-').replace(/-+/g, '-');
  return s ? s.slice(0, 40) : null;
}

/** " 1s4 " -> "1S4"; rỗng -> null. */
function normalizeCtTerminal(v) {
  const s = text(v).toUpperCase().replace(/\s+/g, '');
  return s ? s.slice(0, 20) : null;
}

const num = (v) => (typeof v === 'number' ? v : Number(v));
/** Vùng core trên ảnh trang (tọa độ 0..1); cắt phần tràn; vùng hỏng -> null. */
function normalizeRegion(r) {
  if (!r || typeof r !== 'object') return null;
  const [x, y, w, h] = [r.x, r.y, r.w, r.h].map(num);
  if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || x >= 1 || y >= 1 || w <= 0 || h <= 0) return null;
  const round = (v) => Math.round(v * 10000) / 10000;
  return { x: round(x), y: round(y), w: round(Math.min(w, 1 - x)), h: round(Math.min(h, 1 - y)) };
}

function normalizeCore(c) {
  const pts = Array.isArray(c?.points) ? c.points : [];
  return {
    id: c?.id ? short(c.id, 64) : null,
    coreNo: intIn(c?.coreNo, 1, 99),
    terminalBlock: normalizeTerminal(c?.terminalBlock) || '',
    drawingRef: short(c?.drawingRef, 100),
    spec: short(c?.spec, 100),
    pageId: c?.pageId ? short(c.pageId, 64) : null,
    region: c?.pageId ? normalizeRegion(c?.region) : null,
    points: ROWS.map((r, i) => ({
      seq: i + 1,
      phase: r.phase,
      terminal: normalizeTerminal(pts[i]?.terminal),
      ctTerminal: normalizeCtTerminal(pts[i]?.ctTerminal)
    }))
  };
}

/** Dữ liệu TI gửi lên -> { data, errors }. */
function normalizeCt(input = {}) {
  const errors = [];
  const name = short(input.name, 100);
  if (!name) errors.push({ field: 'name', message: 'Ghi tên biến dòng (vd "TI 272").' });
  const cores = Array.isArray(input.cores) ? input.cores : [];
  if (cores.length > MAX_CORES) errors.push({ field: 'cores', message: `Mỗi TI tối đa ${MAX_CORES} core.` });
  let panel = short(input.panel, 100);
  if (panel && !panel.startsWith('=')) panel = `=${panel}`;
  return {
    data: {
      name,
      bay: short(input.bay, 40),
      panel,
      drawingNumber: short(input.drawingNumber, 150),
      note: text(input.note).slice(0, 1000),
      cores: cores.slice(0, MAX_CORES).map(normalizeCore)
    },
    errors
  };
}

/**
 * Cặp đầu cuộn phía TI có đấu dây: "kS1-kS4", "S1-S4", "s1 / s4", "S1S4" (dữ liệu cũ) -> ["S1", "S4"]; sai -> null.
 */
function parseSide(v) {
  const m = /^K?S(\d)\s*[-/–,]?\s*K?S(\d)$/.exec(String(v || '').toUpperCase().replace(/\s+/g, ' ').trim());
  return m && m[1] !== m[2] ? [`S${m[1]}`, `S${m[2]}`] : null;
}
/** Dạng lưu: "S1-S4"; sai -> null. */
const normalizeSide = (v) => { const p = parseSide(v); return p ? p.join('-') : null; };

const label = (core, i) => `Core ${core.coreNo ?? `#${i + 1}`}`;

/**
 * Kiểm tra trước khi xác nhận. error: chặn xác nhận; warning: kỹ sư đối chiếu bản vẽ.
 * Trả về [{ level, code, core (chỉ số), seq?, message }].
 */
function validateCt(data) {
  const issues = [];
  const add = (level, code, core, message, seq) => issues.push({ level, code, core, ...(seq ? { seq } : {}), message });
  if (!data.cores.length) add('error', 'NO_CORE', null, 'Chưa có core nào.');
  const seenCore = new Map();
  const seenTerminal = new Map();
  data.cores.forEach((c, i) => {
    const name = label(c, i);
    if (c.coreNo === null) add('error', 'MISSING_CORE_NO', i, `${name}: ghi số core.`);
    else if (seenCore.has(c.coreNo)) add('error', 'DUPLICATE_CORE', i, `Core ${c.coreNo} bị trùng.`);
    else seenCore.set(c.coreNo, i);
    if (!c.terminalBlock) add('error', 'INSUFFICIENT_DATA', i, `${name}: khối hàng kẹp ${INSUFFICIENT}.`);
    if (!c.pageId || !c.region) add('warning', 'NO_SOURCE', i, `${name}: chưa khoanh vùng trên bản vẽ để đối chiếu.`);
    c.points.forEach(p => {
      const where = `${name} ${p.phase} (dòng ${p.seq})`;
      if (!p.terminal || !p.ctTerminal) {
        add('error', 'INSUFFICIENT_DATA', i, `${where}: ${!p.terminal ? 'hàng kẹp' : 'đầu phía CT'} ${INSUFFICIENT}.`, p.seq);
      }
      if (p.terminal) {
        if (seenTerminal.has(p.terminal)) add('error', 'DUPLICATE_TERMINAL', i, `${where}: hàng kẹp ${p.terminal} trùng với ${seenTerminal.get(p.terminal)}.`, p.seq);
        else seenTerminal.set(p.terminal, where);
        if (c.terminalBlock && !p.terminal.startsWith(`${c.terminalBlock}-`)) {
          add('warning', 'TERMINAL_BLOCK_MISMATCH', i, `${where}: ${p.terminal} không thuộc khối ${c.terminalBlock}.`, p.seq);
        }
      }
      const m = p.ctTerminal && /^(\d+)S/.exec(p.ctTerminal);
      if (m && c.coreNo !== null && Number(m[1]) !== c.coreNo) {
        add('warning', 'CT_CORE_MISMATCH', i, `${where}: đầu CT ${p.ctTerminal} khác số core ${c.coreNo}.`, p.seq);
      }
    });
  });
  return issues;
}

/** Trạng thái một điểm để hiển thị: ô trống luôn là INSUFFICIENT_DATA, kể cả khi TI đã xác nhận. */
function pointStatus(p, ctStatus) {
  if (!p.terminal || !p.ctTerminal) return 'INSUFFICIENT_DATA';
  return ctStatus === 'VERIFIED' ? 'VERIFIED' : 'NEEDS_REVIEW';
}

const coreKey = (c, i) => (c.coreNo ?? `#${i + 1}`);
const CORE_FIELDS = ['terminalBlock', 'drawingRef', 'spec', 'pageId'];

/** Khác biệt giữa hai danh sách core (theo số core): để ghi nhật ký và báo người dùng. */
function diffCores(before, after) {
  const out = [];
  const old = new Map(before.map((c, i) => [coreKey(c, i), c]));
  const now = new Map(after.map((c, i) => [coreKey(c, i), c]));
  for (const [core, c] of now) {
    const o = old.get(core);
    if (!o) { out.push({ core, change: 'ADDED' }); continue; }
    for (const field of CORE_FIELDS) {
      if ((o[field] || '') !== (c[field] || '')) out.push({ core, field, from: o[field] || '', to: c[field] || '' });
    }
    if (JSON.stringify(o.region || null) !== JSON.stringify(c.region || null)) out.push({ core, field: 'region', from: o.region || null, to: c.region || null });
    c.points.forEach((p, k) => {
      const q = o.points[k] || {};
      for (const field of ['terminal', 'ctTerminal']) {
        if ((q[field] || '') !== (p[field] || '')) out.push({ core, seq: k + 1, phase: ROWS[k].phase, field, from: q[field] || '', to: p[field] || '' });
      }
    });
  }
  for (const core of old.keys()) if (!now.has(core)) out.push({ core, change: 'REMOVED' });
  return out;
}

module.exports = {
  ROWS, INSUFFICIENT, STATUSES, MAX_CORES,
  normalizeTerminal, normalizeCtTerminal, normalizeRegion, normalizeCt, validateCt, pointStatus, diffCores, parseSide, normalizeSide
};
