/** Giấy xác nhận đủ điều kiện đóng điện — hàm thuần cho giao diện. */

// mã/viết tắt giữ in hoa khi đổi tên nhóm về chữ thường
const KEEP_UPPER = new Set(['MC', 'DCL', 'DTĐ', 'TI', 'TU', 'MBA', 'CSV', 'SF6']);
const sentence = (s) => {
  const t = String(s || '').trim();
  if (!t || t !== t.toLocaleUpperCase('vi') || !/\p{L}{3}/u.test(t)) return t;
  // tên nhóm in hoa trong phương án ("MÁY BIẾN ÁP AT2") -> "máy biến áp AT2"
  return t.split(/(\s+)/).map(w => (/\d/.test(w) || KEEP_UPPER.has(w) ? w : w.toLocaleLowerCase('vi'))).join('');
};

/**
 * Lấy từ phương án: mỗi nhóm thiết bị của Bảng 1 (còn hạng mục được chọn) thành một mục kết quả "đạt";
 * trạm, ngăn lộ, đối tượng thí nghiệm, thiết bị xác nhận điền khi còn trống.
 */
export function confirmationFromPlan(form, plan) {
  const d = plan.data || plan;
  const workType = String(d.workType || 'Thí nghiệm').trim();
  const groups = (d.testGroups || []).filter(g => (g.items || []).some(it => it.checked !== false) && g.label);
  const items = groups.length
    ? groups.map(g => ({ text: `${workType} ${sentence(g.label)}`, result: 'đạt' }))
    : [{ text: `${workType} các thiết bị nhất thứ ngăn lộ ${d.bays || ''}`.trim(), result: 'đạt' }];
  const st = d.station || {};
  return {
    ...form,
    planId: plan.id || null,
    station: form.station?.name ? form.station : { substationId: st.substationId || null, name: st.name || '' },
    bays: form.bays || d.bays || '',
    workObject: form.workObject || d.bays || '',
    equipment: form.equipment || d.equipmentText || d.bays || '',
    items
  };
}

export const emptyItem = () => ({ text: '', result: 'đạt' });
