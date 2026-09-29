// Trạng thái form Biên bản khảo sát hiện trường (thuần, không phụ thuộc React).

export const emptyRep = () => ({ honorific: 'Ông', name: '', role: '' });

/** Chức vụ gợi ý cho đại diện QLVH theo đơn vị quản lý trạm: "Tổ trưởng Tổ …", "Trạm trưởng TBA …", "Trưởng Trung tâm …". */
export function qlvhRoleFor(unitName) {
  const name = String(unitName || '').trim();
  if (!name) return '';
  if (/^(trạm|tba)\s/i.test(name)) return `Trạm trưởng ${name}`;
  if (/^tổ\s/i.test(name)) return `Tổ trưởng ${name}`;
  return `Trưởng ${name.charAt(0).toLocaleLowerCase('vi')}${name.slice(1)}`;
}

export function qlvhRoleOptions(unitName) {
  const name = String(unitName || '').trim();
  if (!name) return [];
  if (/^(trạm|tba)\s/i.test(name)) return ['Trạm trưởng', 'Trạm phó', 'Trưởng ca', 'Trực chính'].map(r => `${r} ${name}`);
  if (/^tổ\s/i.test(name)) return ['Tổ trưởng', 'Tổ phó', 'Trưởng ca', 'Trực chính'].map(r => `${r} ${name}`);
  return [qlvhRoleFor(name), ...['Phó', 'Trưởng ca', 'Trực chính'].map(r => `${r} ${name}`)];
}

/**
 * Trạm khảo sát chọn từ danh mục TBA: kèm đơn vị QLVH quản lý và người phụ trách của đơn vị đó.
 * substations: [{ id, name, stationId }]; stations (đơn vị QLVH): [{ id, name, leaderName }].
 */
export function stationFromCatalog(substationId, substations, stations) {
  const sub = substations.find(s => s.id === substationId);
  if (!sub) return null;
  const unit = stations.find(u => u.id === sub.stationId);
  return {
    station: { substationId: sub.id, name: sub.name, qlvhUnitId: unit?.id || null, qlvhUnitName: unit?.name || '' },
    leaderName: unit?.leaderName || ''
  };
}

/**
 * Đổi trạm: đại diện QLVH đầu tiên còn trống tên thì điền người phụ trách đơn vị QLVH;
 * chức vụ còn trống hoặc vẫn là gợi ý cũ thì theo đơn vị mới.
 */
export function withQlvhFor(reps, oldUnitName, newUnitName, leaderName) {
  const oldRole = qlvhRoleFor(oldUnitName);
  const list = reps.length ? reps : [emptyRep()];
  return list.map((r, i) => ({
    ...r,
    name: i === 0 && !r.name ? leaderName || '' : r.name,
    role: !r.role || r.role === oldRole ? qlvhRoleFor(newUnitName) : r.role
  }));
}

export function workUnitRoleOptions(teamShort) {
  if (!teamShort) return [];
  return ['Tổ trưởng', 'Tổ phó', 'Kỹ sư', 'Công nhân'].map(r => `${r} - Tổ ${teamShort}`);
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Khung từ hai điểm kéo chuột (tọa độ tương đối 0–1 trên ảnh); null nếu quá nhỏ (bấm nhầm). */
export function markFromPoints(a, b, label = 'Khu vực công tác') {
  const x1 = clamp01(Math.min(a.x, b.x));
  const y1 = clamp01(Math.min(a.y, b.y));
  const x2 = clamp01(Math.max(a.x, b.x));
  const y2 = clamp01(Math.max(a.y, b.y));
  if (x2 - x1 < 0.01 || y2 - y1 < 0.01) return null;
  const r = (v) => Math.round(v * 10000) / 10000;
  return { x: r(x1), y: r(y1), w: r(x2 - x1), h: r(y2 - y1), label };
}

/** Kích thước ảnh khi dựng một trang PDF: ~dpi điểm/inch, cạnh dài không quá maxSide điểm ảnh. */
export function renderScale(pageWidthPt, pageHeightPt, dpi = 200, maxSide = 6000) {
  const scale = dpi / 72;
  const longest = Math.max(pageWidthPt, pageHeightPt) * scale;
  return longest > maxSide ? maxSide / Math.max(pageWidthPt, pageHeightPt) : scale;
}

const shortDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : '';
};

export function surveyTimeLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || '');
  return m ? `${m[4]}:${m[5]} ${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Phần giấy ĐKCT lấy từ biên bản: căn cứ, nội dung (mục 1), địa điểm (mục 2), đánh giá rủi ro (mục 13). */
export function registrationFromSurvey(data) {
  const place = [data.equipment, data.station?.name].filter(Boolean).join(' tại ');
  return {
    header: { basis: `Biên bản khảo sát hiện trường ngày ${shortDate(data.surveyTime)}` },
    workContent: { text: data.workContent || '', source: 'manual' },
    workLocation: place,
    risks: (data.risks || []).map(r => ({ hazard: r.hazard, measures: r.measures, performer: r.performer })),
    outageId: data.outageId || null,
    // nơi nhận giấy ĐKCT = đơn vị QLVH quản lý trạm đã khảo sát
    ...(data.station?.qlvhUnitId ? { recipient: { stationId: data.station.qlvhUnitId } } : {})
  };
}
