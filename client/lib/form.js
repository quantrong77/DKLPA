// Trạng thái form Giấy ĐKCT phía client (thuần, không phụ thuộc React).
// PersonRef giống server: { personnelId, name, safetyLevel, safetyCard }; null = để trống.

export function personKey(p) {
  if (!p) return '';
  if (p.personnelId) return `id:${p.personnelId}`;
  return `name:${String(p.name || '').trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

export function formatCard(p) {
  const level = p?.safetyLevel || '';
  const card = p?.safetyCard || '';
  if (level && card) return `${level} _ ${card}`;
  return level || card;
}

/** Dòng hiển thị một nhân sự trong danh mục. */
export function personLabel(row) {
  const card = formatCard(row);
  return card ? `${row.fullName} · ${card}` : row.fullName;
}

/** Hàng danh mục nhân sự -> PersonRef. */
export function fromCatalog(row) {
  return { personnelId: row.id, name: row.fullName, safetyLevel: row.safetyLevel || '', safetyCard: row.safetyCard || '' };
}

/** "{n}" trong nhiệm vụ -> số ĐVCT; giấy chỉ có 1 ĐVCT thì bỏ số (và khoảng trắng trước nó). */
export const fillDuty = (duty, n, total = 2) => (total > 1
  ? String(duty || '').replace(/\{n\}/g, String(n))
  : String(duty || '').replace(/\s*\{n\}/g, ''));

/** Nhãn ĐVCT: "ĐVCT" khi chỉ có 1, "ĐVCT2" khi có nhiều. */
export const unitLabel = (index, total) => (total > 1 ? `ĐVCT${index + 1}` : 'ĐVCT');

export const emptyWorkUnit = () => ({ commander: null, members: [], location: '', start: '', end: '' });

export function resizeWorkUnits(units, count) {
  const n = Math.max(1, Math.min(20, Number.parseInt(count, 10) || 1));
  if (n <= units.length) return units.slice(0, n);
  return [...units, ...Array.from({ length: n - units.length }, emptyWorkUnit)];
}

function uniquePeople(list) {
  const seen = new Set();
  return list.filter(p => {
    const k = personKey(p);
    if (!p || !k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Người đã đăng ký trên giấy: CHTT + nhân viên các ĐVCT + người đề cử. */
export function registeredPeople(form) {
  const fromUnits = (form.workUnits || []).flatMap(u => [u.commander, ...(u.members || [])]);
  return uniquePeople([...fromUnits, ...(form.nominees || []).map(n => n.person)]);
}

/** Dựng phụ lục 11.a từ các ĐVCT; giữ những người thêm tay không thuộc ĐVCT nào (vd lái xe). */
export function nomineesFromUnits(units, current = []) {
  const rows = [];
  units.forEach((u, i) => {
    const n = fillDuty(' {n}', i + 1, units.length);
    if (u.commander) rows.push({ person: u.commander, duty: `Chỉ huy trực tiếp đơn vị công tác${n}` });
    (u.members || []).forEach(m => rows.push({ person: m, duty: `Nhân viên đơn vị công tác${n}` }));
  });
  const inUnits = new Set(rows.map(r => personKey(r.person)));
  return [...rows, ...current.filter(n => n.person && !inUnits.has(personKey(n.person)))];
}

/** Sau khi đổi ĐVCT/đề cử: gỡ tham chiếu không còn hợp lệ trong phần cấp phiếu. */
export function pruneAfterChange(form) {
  const allowed = new Set(registeredPeople(form).map(personKey));
  const removed = [];
  const permits = (form.permits || []).map(p => {
    const workers = (p.workers || []).filter(w => {
      const ok = allowed.has(personKey(w));
      if (!ok) removed.push(w.name);
      return ok;
    });
    const workUnitSeq = p.workUnitSeq && p.workUnitSeq <= (form.workUnits || []).length ? p.workUnitSeq : null;
    return { ...p, workers, workUnitSeq };
  });
  return { form: { ...form, permits }, removed: [...new Set(removed)] };
}

/** Dữ liệu giấy đã lưu (server) -> trạng thái form. */
export function fromSaved(data) {
  return {
    ...data,
    header: { ...(data.header || {}) },
    representative: { ...(data.representative || {}) },
    recipient: { ...(data.recipient || {}) },
    workContent: data.workContent || { text: '', source: 'manual' },
    condition: data.condition || { text: '', source: 'manual' },
    time: data.time || { start: '', end: '', source: 'manual' },
    workUnits: (data.workUnits || []).map(u => ({
      commander: u.commander || null,
      members: u.members || [],
      location: u.location || '',
      start: u.start || '',
      end: u.end || ''
    })),
    workUnitCount: (data.workUnits || []).length || 1,
    leader: data.leader || null,
    supervisors: data.supervisors || [],
    watchmen: data.watchmen || [],
    otherUnits: data.otherUnits || [],
    nominees: data.nominees || [],
    permits: (data.permits || []).map(p => ({ ...p, workers: p.workers || [] })),
    risks: data.risks || []
  };
}

/** [{field, message}] -> { field: message } (giữ lỗi đầu tiên của mỗi trường). */
export function fieldErrors(errors = []) {
  const map = {};
  for (const e of errors) if (!(e.field in map)) map[e.field] = e.message;
  return map;
}

/** Xóa ĐVCT thứ `index` (0-based): phiếu gắn ĐVCT đó bỏ chọn, phiếu gắn ĐVCT phía sau lùi số. */
export function removeWorkUnit(form, index) {
  const removedSeq = index + 1;
  const workUnits = form.workUnits.filter((_, i) => i !== index);
  const permits = (form.permits || []).map(p => {
    if (!p.workUnitSeq) return p;
    if (p.workUnitSeq === removedSeq) return { ...p, workUnitSeq: null };
    return p.workUnitSeq > removedSeq ? { ...p, workUnitSeq: p.workUnitSeq - 1 } : p;
  });
  return { ...form, workUnits, workUnitCount: workUnits.length, permits };
}

export const unitHasData = (u) => !!(u.commander || (u.members && u.members.length) || u.location || u.start || u.end);

/** So khớp tên giữ nguyên dấu tiếng Việt (chỉ bỏ hoa/thường và khoảng trắng thừa). */
export const sameName = (a, b) => {
  const n = (s) => String(s || '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  return n(a) === n(b);
};
