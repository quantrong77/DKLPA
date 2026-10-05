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
