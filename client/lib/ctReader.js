// Tự đọc trang bản vẽ mạch dòng (PDF vector): nhãn chữ (ctGlyphs) + dò dây (nét thẳng) -> đề xuất các core.
// Không dùng AI/OCR; kết quả chỉ là đề xuất: kỹ sư kiểm tra rồi mới xác nhận. Thuần, không phụ thuộc DOM.
import { toStroke, penWidthOf, centerSegments } from './ctVector.js';
import { readText } from './ctGlyphs.js';
import { CT_FONT } from './ctFont.js';
import { ROW_TERMINALS } from './ctLibrary.js';

const WIRE_MIN = 4;     // pt: nét thẳng ngắn hơn coi là nét chữ/ký hiệu, không phải dây
const ATTACH = 9;       // pt: nhãn cách đầu dây tối đa
const PHASE_OF = { A: 'L1', B: 'L2', C: 'L3' };

const center = (b) => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
function distToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Dây: nét thẳng dài; nối hai dây khi chạm đầu mút hoặc đầu mút nằm trên thân dây kia (chữ T). */
function wireGraph(strokes, pen) {
  // nét thẳng dài và các đoạn của nét gấp khúc (đường tâm); nét cong (cuộn dây, vòng hàng kẹp) không phải dây
  const wires = strokes.filter(s => s.L >= WIRE_MIN).flatMap(s => centerSegments(s, pen))
    .map(([a, b]) => ({ a, b })).filter(w => dist(w.a, w.b) >= WIRE_MIN);
  const tol = pen * 1.6;
  const adj = wires.map(() => new Set());
  const CELL = 20;
  const grid = new Map();
  wires.forEach((w, i) => {
    const x0 = Math.min(w.a[0], w.b[0]) - tol; const x1 = Math.max(w.a[0], w.b[0]) + tol;
    const y0 = Math.min(w.a[1], w.b[1]) - tol; const y1 = Math.max(w.a[1], w.b[1]) + tol;
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
      for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++) {
        const k = `${gx},${gy}`;
        if (!grid.has(k)) grid.set(k, new Set());
        grid.get(k).add(i);
      }
    }
  });
  const touches = (u, v) => [u.a, u.b].some(p => distToSegment(p, v.a, v.b) <= tol) || [v.a, v.b].some(p => distToSegment(p, u.a, u.b) <= tol);
  for (const ids of grid.values()) {
    const list = [...ids];
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        const i = list[x];
        const j = list[y];
        if (!adj[i].has(j) && touches(wires[i], wires[j])) { adj[i].add(j); adj[j].add(i); }
      }
    }
  }
  return { wires, adj };
}

/** Dây có đầu mút gần điểm p nhất (trong ATTACH); trả về chỉ số dây hoặc -1. */
function nearestWireEnd(graph, p, filter = () => true) {
  let best = -1;
  let bd = ATTACH;
  graph.wires.forEach((w, i) => {
    if (!filter(w)) return;
    for (const q of [w.a, w.b]) { const d = dist(p, q); if (d < bd) { bd = d; best = i; } }
  });
  return best;
}

/** Các dây liên thông với dây start (BFS). */
function reach(graph, start) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const i = queue.shift();
    for (const j of graph.adj[i]) if (!seen.has(j)) { seen.add(j); queue.push(j); }
  }
  return seen;
}

/**
 * Đọc một trang mạch dòng.
 * shapes: hình tô của trang (ctVector.filledShapes); size: { width, height } (pt).
 * Trả về { cores: [{ coreNo, terminalBlock, points[6] { terminal, ctTerminal }, region, notes[] }], words, warnings[] }.
 */
export function readCtPage(shapes, size, font = CT_FONT) {
  const words = readText(shapes, font);
  const ink = shapes.filter(s => s.alpha > 0.9 && s.fill === '#000000');
  const pen = penWidthOf(ink);
  const graph = wireGraph(ink.map(s => toStroke(s, pen)), pen);
  const warnings = [];

  const blocks = words.filter(w => !w.vertical && /^-?X\d{1,3}$/.test(w.text)).map(w => ({ name: w.text.replace(/^-/, ''), box: w.box }));
  const coilLabels = words.filter(w => /^\d{1,2}S\d$/.test(w.text)).map(w => ({ text: w.text, box: w.box, core: Number(w.text.split('S')[0]) }));
  const numbers = words.filter(w => /^[1-9]$/.test(w.text) && w.vertical);
  const headers = words.filter(w => !w.vertical && /^CORE$/.test(w.text));

  const cores = [];
  for (const block of blocks) {
    const [bx, by] = center(block.box);
    // số hàng kẹp 1..6 của khối: cùng hàng với nhãn khối (lệch dọc nhỏ), bên phải nhãn; lấy hàng trên (dây đến từ phía trên)
    const row = numbers.filter(n => {
      const [nx, ny] = center(n.box);
      return nx > bx && nx < bx + 220 && Math.abs(ny - by) < 14;
    });
    const terminals = new Map();
    for (const n of row.sort((a, b) => a.box.y0 - b.box.y0)) {
      const t = Number(n.text);
      if (!terminals.has(t)) terminals.set(t, n);
    }
    const notes = [];
    if ([1, 2, 3, 4, 5, 6].some(t => !terminals.has(t))) notes.push(`Không thấy đủ số hàng kẹp 1–6 của ${block.name}.`);
    // đầu cuộn: nhãn nSk trong cùng cột (giữa nhãn khối và hàng kẹp số 6)
    const right = terminals.has(6) ? center(terminals.get(6).box)[0] + 30 : bx + 220;
    const labels = coilLabels.filter(l => { const [lx] = center(l.box); return lx > bx - 30 && lx < right; });
    const coreNo = labels.length ? mode(labels.map(l => l.core)) : Number((block.name.match(/(\d)$/) || [])[1]) || null;
    // dò dây: mỗi đầu cuộn -> hàng kẹp đầu tiên trong cùng mạng dây
    const terminalWire = new Map();
    for (const [t, n] of terminals) {
      const [nx, ny] = center(n.box);
      terminalWire.set(t, nearestWireEnd(graph, [nx + 3, ny], w => Math.abs(w.a[0] - w.b[0]) < 1)); // dây đứng đi vào đầu trên hàng kẹp
    }
    const ctOf = new Map();
    for (const l of labels) {
      const [lx, ly] = center(l.box);
      const wi = nearestWireEnd(graph, [lx + 3, ly], w => Math.abs(w.a[0] - w.b[0]) < 1);
      if (wi < 0) continue;
      const net = reach(graph, wi);
      const hit = [...terminalWire].filter(([, tw]) => tw >= 0 && net.has(tw)).map(([t]) => t);
      for (const t of hit) {
        if (ctOf.has(t) && ctOf.get(t) !== l.text) notes.push(`Hàng kẹp ${t} nối tới cả ${ctOf.get(t)} và ${l.text}.`);
        else ctOf.set(t, l.text);
      }
    }
    const points = ROW_TERMINALS.map(t => ({ terminal: terminals.has(t) ? `${block.name}-${t}` : '', ctTerminal: ctOf.get(t) || '' }));
    const missing = ROW_TERMINALS.filter(t => !ctOf.has(t));
    if (missing.length) notes.push(`Không dò được dây tới hàng kẹp ${missing.join(', ')} — nhập tay theo bản vẽ.`);
    // vùng core để xem lại: từ tiêu đề CORE (nếu có) tới dưới hàng kẹp, theo bề ngang khối
    const header = headers.filter(h => Math.abs(center(h.box)[0] - (bx + 60)) < 120 && h.box.y0 < by).sort((a, b) => b.box.y0 - a.box.y0)[0];
    const x0 = Math.max(0, block.box.x0 - 12);
    const x1 = Math.min(size.width, right + 6);
    const y0 = Math.max(0, (header ? header.box.y0 : by - 180) - 6);
    const y1 = Math.min(size.height, by + 40);
    cores.push({
      coreNo,
      terminalBlock: block.name,
      points,
      region: { x: x0 / size.width, y: y0 / size.height, w: (x1 - x0) / size.width, h: (y1 - y0) / size.height },
      notes
    });
  }
  if (!blocks.length) warnings.push('Không tìm thấy khối hàng kẹp (-X…) trên trang này.');
  cores.sort((a, b) => (a.coreNo ?? 99) - (b.coreNo ?? 99));
  return { cores, words, warnings };
}

function mode(list) {
  const m = new Map();
  for (const v of list) m.set(v, (m.get(v) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1])[0][0];
}

export { PHASE_OF };
