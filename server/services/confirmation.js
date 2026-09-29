/**
 * Giấy xác nhận đủ điều kiện đóng điện — quy tắc nghiệp vụ thuần, không truy cập DB.
 * Lập từ giấy ĐKCT (trạm, thiết bị, nội dung, tổ, người đăng ký) hoặc tự ghi; mục kết quả mặc định "đạt".
 */
const { text, checkLength } = require('./registration');

const MAX_ITEMS = 50;
const list = (v) => (Array.isArray(v) ? v : []);

// Chữ viết tắt thường gặp trong lịch cắt điện
// (\b của JS không coi chữ có dấu như Đ là chữ nên dùng \p{L})
const word = (w) => new RegExp(`(?<![\\p{L}\\d])${w}(?![\\p{L}\\d])`, 'gu');
const ABBREVIATIONS = [[word('TNĐK'), 'Thí nghiệm định kỳ'], [word('TNSC'), 'Thí nghiệm sau sửa chữa'], [word('TN'), 'Thí nghiệm']];
const expand = (s) => ABBREVIATIONS.reduce((acc, [re, full]) => acc.replace(re, full), String(s || ''));

// Thiết bị/ngăn lộ trong nội dung công tác: "MBA AT1", "MC 212", "TU275", "DCL 174-1", "ngăn 232"
const DEVICE = /(?<![\p{L}\d])(?:MBA\s*)?(?:AT|T)\d{1,2}(?![\p{L}\d])|(?<![\p{L}\d])(?:(?:MC|DCL|DTĐ|TI|TU|CSV|KH)\s*)?\d{3}(?:-\d{1,2})?(?![\d])/gu;

/** Các thiết bị/ngăn lộ nhắc tới trong nội dung công tác, giữ cách viết, không trùng. */
function devicesIn(content) {
  const found = [];
  for (const m of String(content || '').matchAll(DEVICE)) {
    const name = m[0].replace(/\s+/g, ' ').trim();
    if (!found.some(f => f.replace(/\s/g, '') === name.replace(/\s/g, ''))) found.push(name);
  }
  return found;
}

/**
 * Giấy xác nhận nháp từ một giấy ĐKCT: trạm (theo lịch cắt điện / địa điểm), ngăn lộ và thiết bị lấy từ nội dung,
 * mục kết quả = nội dung công tác (TNĐK -> Thí nghiệm định kỳ), tổ và người ký theo giấy đăng ký.
 * reg: { id, data }; substation: TBA khớp địa điểm (hoặc null).
 */
function confirmationFromRegistration(reg, substation) {
  const d = reg.data || {};
  const content = text(d.workContent?.text).replace(/^\d+(\.\d+)*\/\s*/, '');
  const devices = devicesIn(content).join(', ');
  return {
    registrationId: reg.id || null,
    station: substation ? { substationId: substation.id, name: substation.name } : { substationId: null, name: text(d.workLocation) },
    bays: devices,
    workObject: devices || expand(content),
    equipment: devices || expand(content),
    items: content ? [{ text: expand(content), result: 'đạt' }] : [],
    team: { teamName: text(d.header?.teamName), unitName: text(d.header?.unitName) },
    signer: text(d.signatoryName) || text(d.representative?.name)
  };
}

function normalizeConfirmation(input = {}, { substations }) {
  const errors = [];
  if (list(input.items).length > MAX_ITEMS) return { data: null, errors: [{ field: 'items', message: `Tối đa ${MAX_ITEMS} mục kết quả.` }] };
  const h = input.header || {};
  const header = {};
  for (const [key, label] of [['companyName', 'Công ty'], ['unitName', 'Đội'], ['teamName', 'Tổ'], ['teamShort', 'Tên viết tắt tổ'], ['place', 'Địa danh']]) {
    header[key] = checkLength(text(h[key]), `header.${key}`, label, errors);
  }
  header.date = /^\d{4}-\d{2}-\d{2}$/.test(text(h.date)) ? text(h.date) : null;

  const s = input.station?.substationId && substations.get(String(input.station.substationId));
  const station = s ? { substationId: s.id, name: text(s.name) } : { substationId: null, name: text(input.station?.name) };
  checkLength(station.name, 'station', 'Tên trạm', errors);
  if (!station.name) errors.push({ field: 'station', message: 'Chọn hoặc ghi tên trạm / dự án.' });

  const bays = text(input.bays);
  if (!bays) errors.push({ field: 'bays', message: 'Ghi ngăn lộ (vd MC 212).' });
  const workObject = text(input.workObject);
  if (!workObject) errors.push({ field: 'workObject', message: 'Ghi đối tượng thí nghiệm (vd MC 212).' });
  const equipment = text(input.equipment);
  if (!equipment) errors.push({ field: 'equipment', message: 'Ghi thiết bị đủ điều kiện đóng điện.' });

  const items = list(input.items)
    .map(it => ({ text: text(it?.text), result: text(it?.result).slice(0, 50) || 'đạt' }))
    .filter(it => it.text);
  if (!items.length) errors.push({ field: 'items', message: 'Ghi ít nhất một mục khối lượng và kết quả.' });

  const workDate = /^\d{4}-\d{2}-\d{2}$/.test(text(input.workDate)) ? text(input.workDate) : null;
  if (!workDate) errors.push({ field: 'workDate', message: 'Chọn ngày thực hiện công tác.' });
  const signer = checkLength(text(input.signer), 'signer', 'Người ký', errors);
  if (!signer) errors.push({ field: 'signer', message: 'Ghi người ký xác nhận.' });

  const data = {
    header,
    station,
    bays,
    workDate,
    workObject,
    items,
    equipment,
    note: text(input.note),
    signer,
    registrationId: input.registrationId ? text(input.registrationId).slice(0, 64) : null,
    planId: input.planId ? text(input.planId).slice(0, 64) : null
  };
  return { data, errors };
}

module.exports = { normalizeConfirmation, confirmationFromRegistration, devicesIn, expand, MAX_ITEMS };
