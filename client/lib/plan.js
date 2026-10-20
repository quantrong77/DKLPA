// Trạng thái form Phương án (thuần, không phụ thuộc React).

export const CYCLE_LABELS = {
  install: 'Sau lắp đặt',
  year1: 'Sau 1 năm lắp đặt',
  annual: 'Định kỳ 1 năm',
  y3: 'Định kỳ 3 năm',
  y6: 'Định kỳ 6 năm'
};

/**
 * Cột chu kỳ của QĐ 1901 được tính vào một lần thí nghiệm:
 * định kỳ 3 năm làm cả hạng mục 1 năm; "hạng mục của chu kỳ 6 năm bao gồm hạng mục của chu kỳ 3 năm" (Điều 3).
 */
export function cycleColumns(cycle) {
  switch (cycle) {
    case 'y3': return ['y3', 'annual'];
    case 'y6': return ['y6', 'y3', 'annual'];
    default: return [cycle];
  }
}

const isChild = (parent, item) => item.code === '' || item.code.startsWith(`${parent.code}.`);

/**
 * Hạng mục của một loại thiết bị ở một chu kỳ (device: một phần tử của /tests1901).
 * Hạng mục cha không có dấu x (vd "Kiểm tra các biến dòng lắp sẵn") được giữ khi có hạng mục con thuộc chu kỳ.
 */
export function itemsFor(device, cycle) {
  const cols = cycleColumns(cycle);
  const due = (it) => it.cycles.some(c => cols.includes(c));
  const out = [];
  const items = device?.items || [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const child = i > 0 && out.length && it.code !== undefined && (it.code === '' || /\./.test(it.code));
    if (child) {
      if (due(it)) out.push({ name: it.name, note: it.note || '', level: 1, checked: true });
      continue;
    }
    const children = [];
    for (let j = i + 1; j < items.length && isChild(it, items[j]); j++) children.push(items[j]);
    if (due(it) || children.some(due)) out.push({ name: it.name, note: it.note || '', level: 0, checked: true });
    else i += children.length; // bỏ luôn các hạng mục con của hạng mục cha không thuộc chu kỳ
  }
  return out;
}

/** Nhóm thiết bị cho Bảng 1 từ loại thiết bị + chu kỳ; nhãn mặc định là tên nhóm của QĐ 1901. */
export function testGroupFor(device, cycle, label = '') {
  return { deviceKey: device.key, cycle, label: label || device.name, items: itemsFor(device, cycle) };
}

// chữ viết tắt giữ nguyên khi đổi tên nhóm QĐ 1901 (viết hoa) sang chữ thường
const ACRONYMS = new Set(['MBA', 'TI', 'TU', 'MC', 'DCL', 'DTĐ', 'CSV', 'SF6', 'TBA', 'KV']);

/** "MÁY CẮT SF6" -> "Máy cắt SF6"; "MBA TỰ DÙNG" -> "MBA tự dùng" (giữ chữ viết tắt, phần trong ngoặc). */
export function sentenceCase(name) {
  const s = String(name || '').trim();
  if (!s) return s;
  // chỉ đổi từ viết hoa toàn bộ (không phải chữ viết tắt, không có số); từ đã viết thường giữ nguyên
  const upper = (w) => /\p{L}/u.test(w) && w === w.toLocaleUpperCase('vi') && w !== w.toLocaleLowerCase('vi');
  const out = s.split(/(\s+|,|\(|\))/).map(w => (upper(w) && !ACRONYMS.has(w) && !/\d/.test(w) ? w.toLocaleLowerCase('vi') : w)).join('');
  return out.charAt(0).toLocaleUpperCase('vi') + out.slice(1);
}

// tên gọn và ký hiệu viết tắt theo loại thiết bị QĐ 1901 (bảng "Thiết bị cần thí nghiệm")
const EQUIPMENT_KINDS = [
  [/^MBA_TD/, 'Máy biến áp tự dùng', 'MBA'],
  [/^MBA/, 'Máy biến áp', 'MBA'],
  [/^KH$/, 'Kháng điện', 'KH'],
  [/^KK$/, 'Kháng khô', 'KK'],
  [/^TI/, 'Biến dòng điện', 'TI'],
  [/^TU/, 'Biến điện áp', 'TU'],
  [/^MC/, 'Máy cắt', 'MC'],
  [/^DCL/, 'Dao cách ly (Dao tiếp địa)', 'DCL'],
  [/^CSV/, 'Chống sét van', 'CS'],
  [/^ND$/, 'Hệ thống nối đất', '']
];
// chu kỳ ghi gọn trong cột "Hạng mục / Ghi chú"
const CYCLE_SHORT = { install: 'Sau lắp đặt', year1: 'Sau 1 năm', annual: '1 năm', y3: '3 năm', y6: '6 năm' };

/**
 * Dòng bảng "Thiết bị cần thí nghiệm" (mục 3, phần "Thực hiện:") từ các nhóm của Phụ lục I, vd
 * nhóm MC SF6 "MÁY CẮT 572" chu kỳ 6 năm -> { name: 'Máy cắt', position: 'MC 572', note: '6 năm' }.
 * Ký hiệu lấy phần có số trong tên nhóm, thêm chữ viết tắt (MC, TU, TI, CS, DCL…) nếu chưa có. Người lập sửa tiếp.
 */
export function equipmentFromGroups(groups, devices = []) {
  return (groups || []).map(g => {
    const dev = devices.find(d => d.key === g.deviceKey);
    const kind = EQUIPMENT_KINDS.find(([re]) => re.test(String(g.deviceKey || '')));
    const label = String(g.label || '').trim();
    const words = label.split(/\s+/);
    // ký hiệu từ từ đầu tiên có số; giữ chữ viết tắt đứng ngay trước ("BIẾN DÒNG ĐIỆN TI 272" -> "TI 272")
    let at = words.findIndex(w => /\d/.test(w));
    if (at > 0 && (ACRONYMS.has(words[at - 1]) || words[at - 1] === kind?.[2])) at -= 1;
    let position = at >= 0 ? words.slice(at).join(' ') : '';
    if (/^\d/.test(position) && kind?.[2]) position = `${kind[2]} ${position}`;
    // tên gọn theo loại thiết bị; loại khác: tên QĐ 1901 (bỏ phần trong ngoặc); nhóm tự lập: tên nhóm
    const name = kind ? kind[1]
      : dev ? sentenceCase(dev.name.replace(/\s*\(.*\)\s*$/, ''))
        : (at > 0 ? words.slice(0, at).join(' ') : label);
    return { name, position, note: CYCLE_SHORT[g.cycle] || '', deviceKey: dev?.key || '' };
  }).filter(r => r.name || r.position);
}

// tên trong danh sách chọn của bảng "Thiết bị cần thí nghiệm" khi tên nhóm QĐ 1901 viết tắt / khác cách gọi thường dùng
const EQUIPMENT_LABELS = { MBA: 'Máy biến áp', MBA_TD: 'Máy biến áp tự dùng', KH: 'Kháng điện (kháng dầu)', DCL: 'Dao cách ly (Dao tiếp địa)' };
const CYCLE_ORDER = ['install', 'year1', 'annual', 'y3', 'y6'];

/** Danh sách chọn cột "Tên thiết bị": mỗi loại thiết bị QĐ 1901 một dòng, vd { key: 'MC_SF6', label: 'Máy cắt SF6' }. */
export const equipmentOptions = (devices) => (devices || []).map(d => ({ key: d.key, label: EQUIPMENT_LABELS[d.key] || sentenceCase(d.name), source: d.source || '' }));

/**
 * Loại thiết bị QĐ 1901 của một dòng bảng: theo deviceKey, không có thì theo tên (trùng tên trong danh sách chọn,
 * hoặc tên gọn "Máy cắt", "Biến dòng điện…" -> mọi loại cùng nhóm). Tên tự ghi khác: [].
 */
export function equipmentDevices(row, devices = []) {
  const byKey = row?.deviceKey && devices.find(d => d.key === row.deviceKey);
  if (byKey) return [byKey];
  const name = String(row?.name || '').trim().toLocaleLowerCase('vi');
  if (!name) return [];
  const exact = equipmentOptions(devices).find(o => o.label.toLocaleLowerCase('vi') === name);
  if (exact) return devices.filter(d => d.key === exact.key);
  const kind = EQUIPMENT_KINDS.find(([, label]) => name.startsWith(label.toLocaleLowerCase('vi').replace(/\s*\(.*$/, '')));
  return kind ? devices.filter(d => kind[0].test(d.key)) : [];
}

/** Chu kỳ QĐ 1901 có hạng mục của các loại thiết bị (theo thứ tự: sau lắp đặt, sau 1 năm, 1 năm, 3 năm, 6 năm). */
export const deviceCycles = (devs) => CYCLE_ORDER.filter(c => (devs || []).some(d => (d.items || []).some(it => (it.cycles || []).includes(c))));

// chu kỳ ghi ở đầu cột "Hạng mục / Ghi chú" (gọn "6 năm" hoặc đầy đủ "Định kỳ 6 năm"), dài trước để "Sau 1 năm" không khớp "1 năm"
const CYCLE_TEXTS = Object.keys(CYCLE_SHORT).flatMap(c => [[CYCLE_LABELS[c], c], [CYCLE_SHORT[c], c]]).sort((a, b) => b[0].length - a[0].length);
const leadingCycle = (note) => {
  const s = String(note || '');
  const lower = s.toLocaleLowerCase('vi');
  const hit = CYCLE_TEXTS.find(([t]) => lower.startsWith(t.toLocaleLowerCase('vi')) && !/[\p{L}\d]/u.test(s.charAt(t.length)));
  return hit ? { cycle: hit[1], rest: s.slice(hit[0].length).replace(/^\s*[;,.:–-]?\s*/, '') } : { cycle: '', rest: s };
};

/** Chu kỳ đang ghi ở đầu ghi chú: "6 năm; thay dầu" -> 'y6'; không có -> ''. */
export const noteCycle = (note) => leadingCycle(note).cycle;

/** Ghi chú với chu kỳ mới ở đầu (thay chu kỳ cũ nếu có, giữ phần ghi chú còn lại); cycle '' -> bỏ chu kỳ. */
export function withCycle(note, cycle) {
  const { rest } = leadingCycle(note);
  const label = CYCLE_SHORT[cycle] || '';
  return label && rest ? `${label}; ${rest}` : label || rest;
}

/** Trạng thái mặc định khi tiếp nhận / giao trả: dao tiếp địa (565-65, 532-38, "DTĐ …") đóng; máy cắt, dao cách ly mở. */
export const isEarthSwitch = (name) => /DTĐ|tiếp địa/i.test(name) || /\d{3}-\d{2}(?!\d)/.test(name);
export const defaultIsolationState = (name) => (isEarthSwitch(String(name || '')) ? 'closed' : 'open');

/** Một dòng Phụ lục I.1 với trạng thái mặc định theo tên thiết bị. */
export const isolationDevice = (name) => {
  const state = defaultIsolationState(name);
  return { name, receive: state, handover: state };
};

/**
 * Danh sách Phụ lục I.1 dạng { name, receive, handover }; phương án cũ lưu chuỗi tên -> gán mặc định.
 */
export const isolationRows = (list) => (list || []).map(d => (typeof d === 'string'
  ? isolationDevice(d)
  : { name: d?.name || '', receive: d?.receive || defaultIsolationState(d?.name), handover: d?.handover || defaultIsolationState(d?.name) }));

/** Thêm thiết bị (từ trình tự cô lập) chưa có trong danh sách, với trạng thái mặc định. */
export function addIsolationDevices(list, names) {
  const rows = isolationRows(list);
  const have = new Set(rows.map(r => r.name));
  return [...rows, ...names.filter(n => !have.has(n)).map(isolationDevice)];
}

/** Thiết bị trong trình tự cô lập ("mở MC 530, MC 532; đóng các DTĐ 530-65") -> ["MC530", "MC532", "530-65"]. */
export function devicesFromSteps(steps) {
  const found = [];
  for (const line of steps || []) {
    for (const m of String(line).matchAll(/\bMC\s*(\d{3})\b|\b(\d{3}-\d{1,2})\b/gi)) {
      const name = m[1] ? `MC${m[1]}` : m[2];
      if (!found.includes(name)) found.push(name);
    }
  }
  return found;
}

/** Nơi nhận mặc định: TTĐ, đơn vị QLVH (tên viết tắt), lưu. */
export function defaultRecipients(form) {
  const h = form.header || {};
  const tt = String(h.transmissionName || '').replace(/^truyền tải điện\s*/i, '');
  return [
    `TTĐ ${tt || '…'};`,
    `${form.station?.qlvhShort || form.station?.qlvhUnitName || '…'};`,
    `Lưu: VT, Tổ ${h.teamShort || ''}.`.replace(/Tổ \./, 'Tổ.')
  ];
}

/** Cấp điện áp ghi trong tên sơ đồ: "Phía 500kV" -> 500; không ghi -> null. */
export function drawingVoltage(label) {
  const m = /(\d{2,3})\s*kV/i.exec(String(label || ''));
  return m ? Number(m[1]) : null;
}

// chữ số đầu của mã ngăn lộ theo quy ước đánh số vận hành: 5xx 500kV, 2xx 220kV, 1xx 110kV, 3xx 35kV, 4xx 22kV
const BAY_VOLTAGE = { 5: 500, 2: 220, 1: 110, 3: 35, 4: 22 };

/** Các cấp điện áp nhắc tới trong ngăn lộ/thiết bị: "500kV", mã ngăn "532", "MC232", "232-2". */
export function voltagesIn(text) {
  const s = String(text || '');
  const found = new Set();
  for (const m of s.matchAll(/(\d{2,3})\s*kV/gi)) found.add(Number(m[1]));
  for (const m of s.replace(/\d{2,3}\s*kV/gi, ' ').matchAll(/(?<![\d.,])([1-5])\d{2}(?!\d)/g)) found.add(BAY_VOLTAGE[m[1]]);
  return found;
}

/**
 * Gợi ý sơ đồ in ở Phụ lục IV (TBA 500kV có sơ đồ phía 500kV và phía 220kV): chọn sơ đồ có cấp điện áp
 * trùng các ngăn lộ công tác; máy biến áp tự ngẫu (AT1, AT2…) nối hai phía nên chọn tất cả.
 * Không suy ra được thì chọn tất cả. drawings: [{ id, label }] của trạm, theo thứ tự in.
 */
export function suggestDrawings(drawings, text) {
  const all = (drawings || []).map(d => d.id);
  if (all.length <= 1 || /\bAT\s*\d/i.test(String(text || ''))) return all;
  const volts = voltagesIn(text);
  const picked = drawings.filter(d => volts.has(drawingVoltage(d.label))).map(d => d.id);
  return picked.length ? picked : all;
}

/** "Ngăn lộ cắt điện cô lập" lấy từ "Phạm vi / điều kiện cắt điện" của lịch: gộp các dòng (bỏ gạch đầu dòng) thành một dòng. */
export const baysFromScope = (scope) => String(scope || '').split(/\r?\n/).map(s => s.replace(/^\s*[-–•+*]\s*/, '').trim()).filter(Boolean).join('; ');

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
/** Tên phụ lục gợi ý cho file đính kèm thứ i (0, 1, …): sau Phụ lục I–IV của mẫu -> Phụ lục V, VI, … */
export const attachmentLabel = (i) => `Phụ lục ${ROMAN[4 + i] || 4 + i + 1}`;
/** Dòng in ở mục E.3 sau bảng thiết bị cần thí nghiệm; không có phụ lục đính kèm -> ''. */
export const detailText = (attachments) => {
  const labels = (attachments || []).map((a, i) => String(a.label || '').trim() || attachmentLabel(i));
  return labels.length ? `Chi tiết thực hiện: theo ${labels.join(', ')} đính kèm.` : '';
};

/** Khối lượng thi công mặc định từ ngăn lộ. */
export const defaultWorkload = (form) => `Kiểm tra thí nghiệm định kỳ các thiết bị nhất thứ thuộc ngăn lộ ${form.bays || '…'}.`;

/** Phương án lấy từ biên bản khảo sát: trạm, nội dung, rủi ro, liên kết. */
export function planFromSurvey(draft, survey) {
  const d = survey.data || survey;
  const st = d.station || {};
  return {
    ...draft,
    surveyId: survey.id || null,
    outageId: d.outageId || draft.outageId || null,
    workId: d.workId || draft.workId || null,
    station: st.substationId || st.name
      ? { substationId: st.substationId || null, name: st.name || '', qlvhUnitId: st.qlvhUnitId || null, qlvhUnitName: st.qlvhUnitName || '', qlvhShort: draft.station?.qlvhShort || '' }
      : draft.station,
    // đổi trạm thì chọn lại sơ đồ Phụ lục IV theo ngăn lộ
    drawingIds: st.substationId && st.substationId !== draft.station?.substationId ? null : draft.drawingIds,
    equipmentText: draft.equipmentText || d.equipment || '',
    risks: (d.risks || []).map(r => ({ hazard: r.hazard, measures: r.measures, performer: r.performer }))
  };
}

/**
 * Phần giấy ĐKCT lấy từ phương án: căn cứ (số phương án), nội dung, địa điểm (ngăn lộ tại trạm), thời gian, rủi ro,
 * nơi nhận (đơn vị QLVH của trạm); giữ liên kết lịch / công việc / biên bản của phương án và chính phương án (planId).
 */
export function registrationFromPlan(plan) {
  const d = plan.data || plan;
  const st = d.station || {};
  const equipment = String(d.equipmentText || '').trim();
  const type = String(d.workType || '').trim();
  const content = type && !equipment.toLowerCase().startsWith(type.toLowerCase()) ? `${type} ${equipment}`.trim() : equipment || type;
  const time = d.time || {};
  return {
    header: { basis: `Phương án thi công, biện pháp an toàn số ${plan.docNumber || '…'}` },
    workContent: { text: content, source: 'manual' },
    workLocation: [d.bays, st.name].filter(Boolean).join(' tại '),
    ...(time.start || time.end ? { time: { start: time.start || '', end: time.end || '', source: 'manual' } } : {}),
    risks: (d.risks || []).map(r => ({ hazard: r.hazard, measures: r.measures, performer: r.performer })),
    planId: plan.id || null,
    surveyId: d.surveyId || null,
    outageId: d.outageId || null,
    workId: d.workId || null,
    ...(st.qlvhUnitId ? { recipient: { stationId: st.qlvhUnitId } } : {})
  };
}
