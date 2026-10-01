// Nhận dạng chữ vẽ bằng nét (font CAD) từ hình tô của trang PDF — so hình học với bộ mẫu, không OCR, không AI.
// Thuần, không phụ thuộc DOM.
import { toStroke, penWidthOf } from './ctVector.js';

const MAX_GLYPH = 6.5;   // pt: nét dài hơn là dây/khung, không phải nét chữ
const TOUCH = 0.25;      // pt: hai nét cùng ký tự chạm nhau
const WORD_GAP = 1.6;    // pt: khoảng cách tối đa giữa hai ký tự liền nhau theo hướng đọc
const LINE_OVERLAP = 0.4; // hai ký tự cùng dòng: chồng nhau ≥ 40% chiều cao (theo hướng vuông góc)
const SPLIT_GAP = 0.1;   // pt: nét (tính theo đường tâm) bắt đầu sau ký tự trước quá khoảng này là ký tự mới

/** Viền đa giác của hình, nội suy thêm điểm mỗi 0.2pt. */
function outline(pts) {
  const out = [];
  for (let k = 0; k < pts.length; k++) {
    const [x0, y0] = pts[k];
    const [x1, y1] = pts[(k + 1) % pts.length];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.2));
    for (let j = 0; j < n; j++) out.push([x0 + (x1 - x0) * j / n, y0 + (y1 - y0) * j / n]);
  }
  return out;
}

const boxOf = (list) => list.reduce((b, s) => ({ x0: Math.min(b.x0, s.box.x0), y0: Math.min(b.y0, s.box.y0), x1: Math.max(b.x1, s.box.x1), y1: Math.max(b.y1, s.box.y1) }),
  { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
const boxNear = (a, b, g) => a.x0 - g <= b.x1 && b.x0 - g <= a.x1 && a.y0 - g <= b.y1 && b.y0 - g <= a.y1;

/** Gom phần tử theo quan hệ "gần" (union-find); lưới ô (nới thêm reach) để khỏi so mọi cặp. */
function cluster(items, near, cell = 4, reach = 0) {
  const parent = items.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const grid = new Map();
  items.forEach((it, i) => {
    for (let gx = Math.floor((it.box.x0 - reach) / cell); gx <= Math.floor((it.box.x1 + reach) / cell); gx++) {
      for (let gy = Math.floor((it.box.y0 - reach) / cell); gy <= Math.floor((it.box.y1 + reach) / cell); gy++) {
        const key = `${gx},${gy}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
      }
    }
  });
  for (const ids of grid.values()) {
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const i = ids[a];
        const j = ids[b];
        if (find(i) !== find(j) && near(items[i], items[j])) parent[find(i)] = find(j);
      }
    }
  }
  const groups = new Map();
  items.forEach((it, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(it); });
  return [...groups.values()].map(list => ({ items: list, box: boxOf(list) }));
}

const touching = (A, B) => {
  for (const [x, y] of A) for (const [u, v] of B) if ((x - u) ** 2 + (y - v) ** 2 <= TOUCH * TOUCH) return true;
  return false;
};

// khung đọc: ngang (u = x, v = y) hoặc dọc đọc từ dưới lên (chữ xoay 90° ngược chiều kim đồng hồ: u = -y, v = x)
const toFrame = (vertical) => (vertical ? ([x, y]) => [-y, x] : ([x, y]) => [x, y]);

/**
 * Nét chữ của trang -> các từ (chưa nhận dạng): [{ box, vertical, h, chars: [{ pts (khung đọc, chuẩn hoá theo h), box }] }].
 * shapes: hình tô của trang (ctVector.filledShapes). Bỏ watermark (trong suốt) và màu khác đen.
 */
export function wordCandidates(shapes) {
  const ink = shapes.filter(s => s.alpha > 0.9 && s.fill === '#000000');
  const pen = penWidthOf(ink);
  const strokes = ink.map(s => toStroke(s, pen)).filter(s => Math.max(s.box.x1 - s.box.x0, s.box.y1 - s.box.y0) <= MAX_GLYPH);
  for (const s of strokes) s.outline = outline(s.pts);
  const comps = cluster(strokes, (a, b) => boxNear(a.box, b.box, TOUCH) && touching(a.outline, b.outline));
  // từ theo hai hướng đọc: cùng dòng (chồng nhau theo hướng vuông góc) và sát nhau theo hướng đọc
  const lineNear = (vertical) => (a, b) => {
    const [p0, p1, q0, q1] = vertical ? ['x0', 'x1', 'y0', 'y1'] : ['y0', 'y1', 'x0', 'x1'];
    const overlap = Math.min(a.box[p1], b.box[p1]) - Math.max(a.box[p0], b.box[p0]);
    const gap = Math.max(a.box[q0], b.box[q0]) - Math.min(a.box[q1], b.box[q1]);
    return overlap >= LINE_OVERLAP * Math.min(a.box[p1] - a.box[p0], b.box[p1] - b.box[p0]) && gap <= WORD_GAP;
  };
  comps.forEach((c, i) => { c.id = i; });
  const sizeIn = (groups) => { const m = new Map(); for (const g of groups) for (const c of g.items) m.set(c.id, g.items.length); return m; };
  const hSize = sizeIn(cluster(comps, lineNear(false), 6, WORD_GAP));
  const vSize = sizeIn(cluster(comps, lineNear(true), 6, WORD_GAP));
  // mỗi thành phần theo hướng có nhiều láng giềng hơn; bằng nhau (đứng một mình) thì chưa rõ: thử cả hai
  const dir = comps.map(c => (hSize.get(c.id) > vSize.get(c.id) ? 'h' : vSize.get(c.id) > hSize.get(c.id) ? 'v' : null));
  const words = [];
  for (const d of ['h', 'v']) {
    const mine = comps.filter((c, i) => dir[i] === d);
    for (const w of cluster(mine, lineNear(d === 'v'), 6, WORD_GAP)) words.push(charsOf(w, d === 'v', pen));
  }
  for (const c of comps.filter((_, i) => dir[i] === null)) {
    const w = { items: [c], box: c.box };
    words.push({ ...charsOf(w, false, pen), alt: charsOf(w, true, pen) });
  }
  return words;
}

/** Tách từ thành ký tự theo hướng đọc: nét của ký tự sau bắt đầu sau khi ký tự trước kết thúc. */
function charsOf(word, vertical, pen) {
  const f = toFrame(vertical);
  const strokes = word.items.flatMap(c => c.items).map(s => {
    const pts = s.outline.map(f);
    let u0 = Infinity; let u1 = -Infinity; let v0 = Infinity; let v1 = -Infinity;
    for (const [u, v] of pts) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    return { pts, u0: u0 + pen / 2, u1: u1 - pen / 2, v0, v1, straight: s.straight, a: f(s.a), b: f(s.b) };
  }).sort((a, b) => a.u0 - b.u0 || a.u1 - b.u1);
  const groups = [];
  for (const s of strokes) {
    const g = groups[groups.length - 1];
    if (g && s.u0 <= g.u1 + SPLIT_GAP) { g.items.push(s); g.u1 = Math.max(g.u1, s.u1); } else groups.push({ items: [s], u0: s.u0, u1: s.u1 });
  }
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const s of strokes) { v0 = Math.min(v0, s.v0); v1 = Math.max(v1, s.v1); }
  const h = Math.max(v1 - v0, pen);
  const chars = groups.map(g => {
    let cu0 = Infinity;
    for (const s of g.items) for (const [u] of s.pts) cu0 = Math.min(cu0, u);
    const one = g.items.length === 1 && g.items[0].straight ? g.items[0] : null;
    return {
      pts: g.items.flatMap(s => s.pts).map(([u, v]) => [(u - cu0) / h, (v - v0) / h]),
      u0: g.u0, u1: g.u1,
      // ký tự một nét thẳng (-, /, |): nhận theo góc, không so mẫu
      line: one && { du: (one.b[0] - one.a[0]) / h, dv: (one.b[1] - one.a[1]) / h }
    };
  });
  return { box: word.box, vertical, h, chars };
}

// ---- so khớp với bộ mẫu ----

/** Khoảng cách chamfer đối xứng (trung bình khoảng cách điểm gần nhất), đơn vị = chiều cao chữ. Bản chậm, dùng khi gom mẫu. */
export function chamfer(A, B) {
  const one = (P, Q) => {
    let sum = 0;
    for (const [x, y] of P) {
      let best = Infinity;
      for (const [a, b] of Q) { const d = (x - a) ** 2 + (y - b) ** 2; if (d < best) best = d; }
      sum += Math.sqrt(best);
    }
    return sum / P.length;
  };
  return Math.max(one(A, B), one(B, A));
}

/** Rút gọn đám điểm (lưới 0.04h) để so nhanh. */
export function thin(pts, step = 0.04) {
  const seen = new Set();
  const out = [];
  for (const [u, v] of pts) {
    const key = `${Math.round(u / step)},${Math.round(v / step)}`;
    if (!seen.has(key)) { seen.add(key); out.push([Math.round(u / step) * step, Math.round(v / step) * step]); }
  }
  return out;
}

// Bản đồ khoảng cách trên lưới (khung chuẩn hoá theo chiều cao chữ): tra khoảng cách tới điểm gần nhất trong O(1).
const GRID = { u0: -0.4, v0: -0.4, step: 0.05, nu: 50, nv: 42 };
const FAR = 1;
function distanceField(pts) {
  const { u0, v0, step, nu, nv } = GRID;
  const f = new Float32Array(nu * nv).fill(FAR * 4);
  for (const [u, v] of pts) {
    const i = Math.round((u - u0) / step);
    const j = Math.round((v - v0) / step);
    if (i >= 0 && i < nu && j >= 0 && j < nv) f[j * nu + i] = 0;
  }
  // biến đổi khoảng cách chamfer hai lượt (1, √2)
  const d1 = step;
  const d2 = step * Math.SQRT2;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const k = j * nu + i;
      if (i > 0) f[k] = Math.min(f[k], f[k - 1] + d1);
      if (j > 0) {
        f[k] = Math.min(f[k], f[k - nu] + d1);
        if (i > 0) f[k] = Math.min(f[k], f[k - nu - 1] + d2);
        if (i < nu - 1) f[k] = Math.min(f[k], f[k - nu + 1] + d2);
      }
    }
  }
  for (let j = nv - 1; j >= 0; j--) {
    for (let i = nu - 1; i >= 0; i--) {
      const k = j * nu + i;
      if (i < nu - 1) f[k] = Math.min(f[k], f[k + 1] + d1);
      if (j < nv - 1) {
        f[k] = Math.min(f[k], f[k + nu] + d1);
        if (i < nu - 1) f[k] = Math.min(f[k], f[k + nu + 1] + d2);
        if (i > 0) f[k] = Math.min(f[k], f[k + nu - 1] + d2);
      }
    }
  }
  return f;
}
const meanDist = (pts, field) => {
  const { u0, v0, step, nu, nv } = GRID;
  let sum = 0;
  for (const [u, v] of pts) {
    const i = Math.round((u - u0) / step);
    const j = Math.round((v - v0) / step);
    sum += i >= 0 && i < nu && j >= 0 && j < nv ? field[j * nu + i] : FAR;
  }
  return sum / pts.length;
};

const prepared = new WeakMap();
function prepare(font) {
  if (!prepared.has(font)) {
    prepared.set(font, font.map(g => {
      let h = 0;
      for (const [, v] of g.pts) h = Math.max(h, v);
      return { ...g, h, field: distanceField(g.pts) };
    }));
  }
  return prepared.get(font);
}

/** Ký tự một nét thẳng: theo góc trong khung đọc. */
function lineChar({ du, dv }) {
  const ang = Math.abs(Math.atan2(dv, du) * 180 / Math.PI);  // 0 ngang .. 90 đứng
  const len = Math.hypot(du, dv);
  if (len < 0.15) return { ch: '.', d: 0 };
  if (ang < 15 || ang > 165) return { ch: '-', d: 0 };
  if (ang > 75 && ang < 105) return { ch: '|', d: 0 };
  if (len > 0.5) return { ch: (du > 0) === (dv < 0) ? '/' : '\\', d: 0 };
  return { ch: null, d: 1 };
}

/** Ký tự -> { ch, d } theo mẫu gần nhất; d lớn quá ngưỡng -> ch = null (không nhận ra). */
export function matchChar(char, font, limit = 0.09) {
  if (char.line) return lineChar(char.line);
  const P = thin(char.pts);
  let w = 0;
  let h = 0;
  for (const [u, v] of P) { w = Math.max(w, u); h = Math.max(h, v); }
  const field = distanceField(P);
  let best = { ch: null, d: Infinity };
  for (const g of prepare(font)) {
    if (Math.abs(g.w - w) > 0.25 || Math.abs(g.h - h) > 0.3) continue;
    // lượng nét phải tương đương (vùng tô đặc/đám điểm dày không được coi là chữ)
    if (P.length < g.pts.length * 0.6 || P.length > g.pts.length * 1.6) continue;
    const d = Math.max(meanDist(P, g.field), meanDist(g.pts, field));
    if (d < best.d) best = { ch: g.ch, d };
  }
  return best.d <= limit ? best : { ch: null, d: best.d };
}

/**
 * Đọc chữ của trang: [{ text, box, vertical, h, score }] (text có '?' ở ký tự không nhận ra).
 * font: [{ ch, w, pts }] (ctFont.js). Từ một ký tự: thử cả hai hướng, lấy hướng khớp hơn.
 */
export function readText(shapes, font) {
  const out = [];
  for (const cand of wordCandidates(shapes)) {
    const tries = [cand, cand.alt].filter(Boolean).map(c => {
      const m = c.chars.map(ch => matchChar(ch, font));
      return { c, m, cost: m.reduce((s, x) => s + Math.min(x.d, 0.3), 0) / m.length };
    }).sort((a, b) => a.cost - b.cost);
    const { c, m, cost } = tries[0];
    if (!m.some(x => x.ch)) continue;
    out.push({ text: m.map(x => x.ch || '?').join(''), box: c.box, vertical: c.vertical, h: c.h, score: +cost.toFixed(3) });
  }
  return out;
}
