/**
 * Dấu thay đổi của dòng lịch cắt điện sau khi nạp lại lịch (máy chủ: server/services/outageChange.js).
 * NEW chỉ đánh dấu trong tab Lịch cắt điện; hoãn / dời / sửa thì cảnh báo cả hồ sơ đã gắn dòng lịch đó.
 */
export const OUTAGE_CHANGES = {
  POSTPONED: { label: 'Hoãn', alert: 'Lịch cắt điện đã hoãn — kiểm tra lại trước khi lập, nộp hồ sơ.' },
  MOVED: { label: 'Dời lịch', alert: 'Lịch cắt điện đã dời — cập nhật thời gian trong hồ sơ.' },
  EDITED: { label: 'Sửa nội dung', alert: 'Lịch cắt điện đã sửa nội dung — đối chiếu lại hồ sơ.' },
  NEW: { label: 'Phát sinh', alert: null }
};

/** Cảnh báo cho hồ sơ gắn dòng lịch `kind`; null nếu không cần cảnh báo. */
export function outageAlert(kind, note) {
  const c = OUTAGE_CHANGES[kind];
  if (!c?.alert) return null;
  return { kind, label: c.label, text: c.alert, note: note || '' };
}

/** Dòng lịch đầu tiên trong luồng công việc cần cảnh báo (hoãn ưu tiên trước dời, sửa). */
export function chainAlert(outages) {
  const order = ['POSTPONED', 'MOVED', 'EDITED'];
  const hit = [...(outages || [])].filter(o => outageAlert(o.changeKind))
    .sort((a, b) => order.indexOf(a.changeKind) - order.indexOf(b.changeKind))[0];
  return hit ? { ...outageAlert(hit.changeKind, hit.changeNote), outage: hit } : null;
}
