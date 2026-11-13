/** Kế hoạch thí nghiệm hằng năm -> phương án: hàm thuần cho giao diện. */
import { testGroupFor, equipmentOptions, EQUIPMENT_CYCLE_LABELS } from './plan.js';

/** Khóa so ngăn lộ như máy chủ (services/testPlan.js): "AT 1" = "AT1", "MC 231" = "231". */
export const bayKey = (bay) => String(bay || '').trim().toUpperCase().replace(/^(MC|NGĂN|NGAN|MBA)\s*/i, '').replace(/[\s.]/g, '');

/** Các ngăn lộ ghi ở phương án ("530, 532, MBA AT2", "MC 231 và 131") -> tập khóa. */
export function planBayKeys(bays) {
  return new Set(String(bays || '').split(/[,;/+]|\s+và\s+|\n/i).map(bayKey).filter(Boolean));
}

/**
 * Ngăn lộ của kế hoạch thuộc ngăn lộ phương án: cùng khóa ("AT1" = "AT 1"), hoặc số hiệu ngăn 3 chữ số của phương án nằm
 * trong tên ngăn của kế hoạch ("572" ~ "XT572", "FL NXT 572", "KH505" ~ "505").
 */
export function bayMatches(planKeys, bay) {
  const key = bayKey(bay);
  for (const pk of planKeys) {
    if (key === pk) return true;
    if (/^\d{3}$/.test(pk) && new RegExp(`(^|\\D)${pk}(\\D|$)`).test(key)) return true;
  }
  return false;
}

// chu kỳ dùng lập hạng mục Bảng 1: dài nhất (6 năm gồm 3 năm, 3 năm gồm 1 năm — QĐ 1901 Điều 3)
const ORDER = ['y6', 'y3', 'annual', 'year1', 'install'];
export const mainCycle = (cycles) => ORDER.find(c => (cycles || []).includes(c)) || null;

/** Ghi chú cột "Hạng mục / Ghi chú": chu kỳ (6 năm; Tăng cường), kiểm định AT, ghi chú của kế hoạch. */
export function itemNote(item) {
  const short = { y6: '6 năm', y3: '3 năm', annual: '1 năm', year1: 'Sau 1 năm', install: 'Sau lắp đặt', tc: 'Tăng cường' };
  return [...(item.cycles || []).map(c => short[c] || EQUIPMENT_CYCLE_LABELS[c] || c), item.inspection ? 'Kiểm định AT' : '', item.note || '']
    .filter(Boolean).join('; ');
}

/**
 * Thêm các dòng kế hoạch đã chọn vào phương án:
 * - Bảng 1: thiết bị có loại QĐ 1901 và chu kỳ QĐ 1901 -> một nhóm (hạng mục theo chu kỳ dài nhất), nhãn = tên thiết bị;
 * - bảng thiết bị cần thí nghiệm: mọi dòng (tên loại thiết bị, ký hiệu, chu kỳ / kiểm định AT);
 * - testPlanItemIds: các dòng kế hoạch phương án dùng.
 * Bỏ dòng đã có (cùng loại + nhãn / cùng tên + ký hiệu). -> { form, groups, rows } (số nhóm, số dòng đã thêm)
 */
export function fromTestPlan(form, items, devices = []) {
  const options = equipmentOptions(devices);
  const groups = [...(form.testGroups || [])];
  const rows = [...(form.testEquipment || [])];
  const norm = (s) => String(s || '').toLocaleLowerCase('vi').replace(/\s+/g, '');
  let g = 0;
  let r = 0;
  for (const it of items) {
    const device = it.deviceKey && devices.find(d => d.key === it.deviceKey);
    const cycle = mainCycle(it.cycles);
    if (device && cycle && !groups.some(x => x.deviceKey === device.key && norm(x.label) === norm(it.deviceName))) {
      groups.push(testGroupFor(device, cycle, it.deviceName));
      g += 1;
    }
    const name = options.find(o => o.key === it.deviceKey)?.label || it.deviceName;
    const position = name === it.deviceName ? it.bay || '' : it.deviceName;
    if (!rows.some(x => norm(x.name) === norm(name) && norm(x.position) === norm(position))) {
      rows.push({ name, position, note: itemNote(it), deviceKey: it.deviceKey || '' });
      r += 1;
    }
  }
  const ids = [...new Set([...(form.testPlanItemIds || []), ...items.map(it => it.id)])];
  return { form: { ...form, testGroups: groups, testEquipment: rows, testPlanItemIds: ids }, groups: g, rows: r };
}
