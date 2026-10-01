// Đọc nét vẽ vector của trang bản vẽ (PDF xuất từ CAD): mỗi nét — kể cả nét chữ — là một hình tô nhỏ.
// Thuần, không phụ thuộc DOM: dùng được trong trình duyệt và trong test Node.

/** Nhân ma trận affine [a, b, c, d, e, f] (như PDF): m × n. */
export const mulMatrix = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
];

/**
 * Operator list của pdf.js (getOperatorList) -> các hình tô [{ pts: [[x, y]…], fill, alpha }] theo toạ độ trang
 * (gốc trên-trái, đơn vị pt). OPS: bảng mã lệnh của pdf.js; viewportTransform: page.getViewport({ scale: 1 }).transform.
 * Đường cong Bézier lấy mẫu vài điểm (đủ cho nhận dạng hình chữ).
 */
export function filledShapes(opList, OPS, viewportTransform) {
  let st = { ctm: viewportTransform.slice(), fill: '#000000', alpha: 1 };
  const stack = [];
  const out = [];
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const a = opList.argsArray[i];
    if (fn === OPS.save) stack.push({ ...st });
    else if (fn === OPS.restore) st = stack.pop() || st;
    else if (fn === OPS.transform) st.ctm = mulMatrix(st.ctm, a);
    else if (fn === OPS.setFillRGBColor) st.fill = typeof a[0] === 'string' ? a[0] : rgbHex(a);
    else if (fn === OPS.setFillGray) st.fill = rgbHex([a[0] * 255, a[0] * 255, a[0] * 255]);
    else if (fn === OPS.setGState) { for (const [k, v] of a[0] || []) if (k === 'ca') st.alpha = v; }
    else if (fn === OPS.constructPath && (a[0] === OPS.fill || a[0] === OPS.eoFill)) {
      const pts = pathPoints(a[1]?.[0], st.ctm);
      if (pts.length >= 2) out.push({ pts, fill: st.fill, alpha: st.alpha });
    }
  }
  return out;
}

const rgbHex = (c) => `#${c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Dữ liệu đường của pdf.js 5 (mã DrawOPS: 0 moveTo, 1 lineTo, 2 curveTo, 3 quadraticCurveTo, 4 closePath). */
function pathPoints(data, m) {
  const pts = [];
  if (!data) return pts;
  const P = (x, y) => pts.push([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < data.length;) {
    const op = data[k++];
    if (op === 0 || op === 1) { cx = data[k]; cy = data[k + 1]; P(cx, cy); k += 2; }
    else if (op === 2) {
      const [x1, y1, x2, y2, x3, y3] = [data[k], data[k + 1], data[k + 2], data[k + 3], data[k + 4], data[k + 5]];
      for (const t of [0.2, 0.4, 0.6, 0.8, 1]) {
        const u = 1 - t;
        P(u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
      cx = x3; cy = y3; k += 6;
    } else if (op === 3) { cx = data[k + 2]; cy = data[k + 3]; P(cx, cy); k += 4; }
    else if (op !== 4) break;
  }
  return pts;
}

/**
 * Hình tô -> nét: trục chính (PCA), dài L, dày W, tâm, hai đầu mút trên trục (lùi nửa bề dày).
 * straight: nét thẳng (dày xấp xỉ bề dày nét bút).
 */
export function toStroke(shape, penWidth) {
  const { pts } = shape;
  const n = pts.length;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= n; cy /= n;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const [x, y] of pts) { xx += (x - cx) ** 2; yy += (y - cy) ** 2; xy += (x - cx) * (y - cy); }
  const ang = 0.5 * Math.atan2(2 * xy, xx - yy);
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  let lo = Infinity;
  let hi = -Infinity;
  let wlo = Infinity;
  let whi = -Infinity;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const [x, y] of pts) {
    const t = (x - cx) * ux + (y - cy) * uy;
    const w = -(x - cx) * uy + (y - cy) * ux;
    lo = Math.min(lo, t); hi = Math.max(hi, t); wlo = Math.min(wlo, w); whi = Math.max(whi, w);
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const W = whi - wlo;
  const mid = (wlo + whi) / 2;
  const inset = Math.min(W / 2, (hi - lo) / 2);
  const ox = cx - mid * uy;
  const oy = cy + mid * ux;
  return {
    pts,
    L: hi - lo,
    W,
    straight: W <= penWidth * 1.35,
    a: [ox + (lo + inset) * ux, oy + (lo + inset) * uy],
    b: [ox + (hi - inset) * ux, oy + (hi - inset) * uy],
    box: { x0: minX, y0: minY, x1: maxX, y1: maxY }
  };
}

/**
 * Đường tâm của một nét: nét thẳng -> một đoạn; nét gấp khúc (dây đi lên, ngang, xuống… vẽ thành một hình)
 * -> các đoạn lấy từ từng cặp cạnh viền song song cách nhau đúng một bề dày nét. Nét cong (cuộn dây, vòng tròn) -> [].
 */
export function centerSegments(stroke, penWidth) {
  if (stroke.straight) return [[stroke.a, stroke.b]];
  const P = stroke.pts;
  const edges = [];
  for (let k = 0; k < P.length; k++) {
    const p = P[k];
    const q = P[(k + 1) % P.length];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len >= penWidth * 2) edges.push({ p, q, len, ux: (q[0] - p[0]) / len, uy: (q[1] - p[1]) / len });
  }
  const out = [];
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e = edges[i];
      const f = edges[j];
      if (Math.abs(e.ux * f.uy - e.uy * f.ux) > 0.05) continue; // không song song
      const sep = Math.abs(-(f.p[0] - e.p[0]) * e.uy + (f.p[1] - e.p[1]) * e.ux);
      if (Math.abs(sep - penWidth) > penWidth * 0.35) continue;
      // phần chồng nhau theo phương cạnh
      const t = (pt) => (pt[0] - e.p[0]) * e.ux + (pt[1] - e.p[1]) * e.uy;
      const lo = Math.max(0, Math.min(t(f.p), t(f.q)));
      const hi = Math.min(e.len, Math.max(t(f.p), t(f.q)));
      if (hi - lo < penWidth * 2) continue;
      const side = (-(f.p[0] - e.p[0]) * e.uy + (f.p[1] - e.p[1]) * e.ux) / 2;
      const base = [e.p[0] - side * e.uy, e.p[1] + side * e.ux];
      out.push([[base[0] + lo * e.ux, base[1] + lo * e.uy], [base[0] + hi * e.ux, base[1] + hi * e.uy]]);
    }
  }
  return out;
}

/** Bề dày nét bút phổ biến nhất (mode của W các hình mảnh). */
export function penWidthOf(shapes) {
  const counts = new Map();
  for (const s of shapes) {
    const w = Math.round(toStroke(s, Infinity).W * 20) / 20;
    if (w > 0) counts.set(w, (counts.get(w) || 0) + 1);
  }
  let best = 0.75;
  let n = 0;
  for (const [w, c] of counts) if (c > n || (c === n && w < best)) { best = w; n = c; }
  return best;
}
