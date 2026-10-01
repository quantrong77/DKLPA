// Thư viện cô lập mạch dòng (thuần, không phụ thuộc React).

/** Số thứ tự hàng kẹp của 6 dòng mỗi core: L1 (1, 4), L2 (2, 5), L3 (3, 6). */
export const ROW_TERMINALS = [1, 4, 2, 5, 3, 6];
export const ROW_PHASES = ['L1', 'L1', 'L2', 'L2', 'L3', 'L3'];
export const DEFAULT_CORES_SHOWN = 4;
export const INSUFFICIENT = 'CHƯA ĐỦ DỮ LIỆU';
/** Cặp đầu cuộn phía TI có đấu dây hay gặp; vẫn gõ được cặp khác (vd kS3-kS4). */
export const CT_SIDE_PRESETS = ['S1-S2', 'S1-S3', 'S1-S4', 'S1-S5', 'S2-S3', 'S2-S4', 'S2-S5'];

/** "kS1-kS4", "S1-S4", "s1 / s4", "S1S4" -> ["S1", "S4"]; sai -> null. */
export function parseSide(v) {
  const m = /^K?S(\d)\s*[-/–,]?\s*K?S(\d)$/.exec(String(v || '').toUpperCase().replace(/\s+/g, ' ').trim());
  return m && m[1] !== m[2] ? [`S${m[1]}`, `S${m[2]}`] : null;
}
export const normalizeSide = (v) => { const p = parseSide(v); return p ? p.join('-') : null; };
/** "S1-S4" -> "kS1-kS4" (cách ghi trên giao diện). */
export const sideLabel = (v) => { const p = parseSide(v); return p ? `k${p[0]}-k${p[1]}` : String(v || ''); };

/**
 * Điền nhanh 6 dòng theo khối hàng kẹp (X41) và nhãn hai đầu cuộn CT có đấu dây (S1, S4…).
 * Chỉ là gợi ý: phần không suy ra được (chưa có số core/khối kẹp) để trống; kỹ sư phải đối chiếu bản vẽ.
 */
export function patternPoints(core, from = 'S1', to = 'S2') {
  const block = String(core.terminalBlock || '').trim();
  const no = core.coreNo;
  return ROW_TERMINALS.map((t, i) => ({
    terminal: block ? `${block}-${t}` : '',
    ctTerminal: no ? `${no}${i % 2 ? to : from}` : ''
  }));
}

/**
 * Thông tin khung tên đọc được từ lớp chữ của trang PDF (nhãn trong mạch thường là nét vẽ, không đọc được).
 * Thiếu mục nào thì để trống.
 */
export function parseTitleBlock(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ');
  const panels = [...text.matchAll(/=\s*([A-Z0-9]+\+[A-Z0-9.,]+)/gi)].map(m => `=${m[1].toUpperCase()}`);
  const page = /Trang\s*số\s*:?\s*(\d+\s*\/\s*\d+)/i.exec(text);
  const drawing = /\b([A-Z0-9]+\/[\d.]+\/[A-Z]\d+-\d+)\b/i.exec(text);
  const bay = /NGĂN[^\d]{0,40}?(\d{3})\b/i.exec(text);
  const sheet = /\b(Q\d+-\d+)\b/.exec(text);
  return {
    panel: panels.find(p => /\+MK/i.test(p)) || panels[0] || '',
    pageLabel: page ? page[1].replace(/\s+/g, '') : '',
    drawingNumber: drawing ? drawing[1] : '',
    bay: bay ? bay[1] : '',
    sheet: sheet ? sheet[1] : ''
  };
}

/** Tham chiếu bản vẽ in ở dòng "Tách các link…": "<tủ>/<số trang>", vd "=D02+MK202/115". */
export function drawingRefFor(panel, pageLabel) {
  const page = /^(\d+)/.exec(String(pageLabel || '').trim());
  if (!panel || !page) return '';
  return `${panel.startsWith('=') ? panel : `=${panel}`}/${page[1]}`;
}

/** Kiểu CSS để khung hiển thị chỉ vùng core của ảnh trang (ảnh phóng to, dịch theo vùng). */
export function cropStyle(region, width, height) {
  const pct = (v) => `${Math.round(v * 10000) / 100}%`;
  return {
    box: { aspectRatio: `${Math.round(region.w * width)} / ${Math.round(region.h * height)}` },
    img: { width: pct(1 / region.w), left: pct(-region.x / region.w), top: pct(-region.y / region.h) }
  };
}

const snapCore = (c) => ({
  coreId: c.id || null,
  coreNo: c.coreNo ?? null,
  terminalBlock: c.terminalBlock || '',
  drawingRef: c.drawingRef || '',
  pageId: c.pageId || null,
  region: c.region || null,
  points: ROW_TERMINALS.map((_, i) => ({ terminal: c.points?.[i]?.terminal || '', ctTerminal: c.points?.[i]?.ctTerminal || '' }))
});

/**
 * Khối Phụ lục II lấy từ thư viện: bản chụp TI tại lúc chọn (thư viện sửa sau không làm đổi phương án đã lập).
 * coresShown: số core in (mặc định 4, không quá số core của TI).
 */
export function blockFromLibrary(ct, coresShown = DEFAULT_CORES_SHOWN) {
  const cores = (ct.cores || []).map(snapCore);
  return {
    ctId: ct.id,
    revision: ct.revision || 1,
    status: ct.status || 'DRAFT',
    updatedAt: ct.updatedAt || '',
    name: ct.name || '',
    panel: ct.panel || '',
    coresShown: Math.max(1, Math.min(coresShown || DEFAULT_CORES_SHOWN, cores.length || 1)),
    cores
  };
}

/** Khác biệt giữa bản chụp trong phương án và TI hiện tại của thư viện (dòng mô tả cho người dùng). */
export function libraryChanges(block, ct) {
  const fresh = blockFromLibrary(ct, block.coresShown);
  const out = [];
  if (block.name !== fresh.name) out.push(`Tên: ${block.name} → ${fresh.name}`);
  if (block.panel !== fresh.panel) out.push(`Tủ: ${block.panel || '—'} → ${fresh.panel || '—'}`);
  if (block.status !== fresh.status) out.push(`Trạng thái: ${block.status} → ${fresh.status}`);
  const old = new Map(block.cores.map(c => [c.coreNo, c]));
  for (const c of fresh.cores) {
    const o = old.get(c.coreNo);
    if (!o) { out.push(`Core ${c.coreNo}: thêm mới`); continue; }
    if (o.terminalBlock !== c.terminalBlock) out.push(`Core ${c.coreNo}: khối kẹp ${o.terminalBlock || '—'} → ${c.terminalBlock || '—'}`);
    if (o.drawingRef !== c.drawingRef) out.push(`Core ${c.coreNo}: bản vẽ ${o.drawingRef || '—'} → ${c.drawingRef || '—'}`);
    c.points.forEach((p, i) => {
      const q = o.points[i] || {};
      for (const f of ['terminal', 'ctTerminal']) {
        if ((q[f] || '') !== p[f]) out.push(`Core ${c.coreNo} ${ROW_PHASES[i]}: ${q[f] || '—'} → ${p[f] || '—'}`);
      }
    });
    old.delete(c.coreNo);
  }
  for (const no of old.keys()) out.push(`Core ${no}: đã bỏ`);
  return out;
}
