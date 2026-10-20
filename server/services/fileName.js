/**
 * Tên file Word xuất ra: "yyyymmdd_Số_Loại_NgănLộ_Trạm.docx", vd
 *   20261005_3-PA-TNKH.Nhatthu_PA_AT1-231_TBA-220kV-Thap-Cham.docx
 * - bỏ dấu tiếng Việt (gửi email/Zalo, lưu trên máy nào cũng giữ đúng tên);
 * - "_" ngăn các phần, "-" thay khoảng trắng và "/" trong một phần; phần trống thì bỏ (biên bản KSHT không có số).
 */
const { devicesIn } = require('./confirmation');

const TYPES = { registration: 'DKCT', survey: 'BBKSHT', plan: 'PA', confirmation: 'GXN' };

function ascii(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

/** Một phần của tên: chỉ chữ, số, "." và "-"; tối đa `max` ký tự. */
function part(s, max = 60) {
  return ascii(s).replace(/[^A-Za-z0-9.]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, max).replace(/-+$/, '');
}

const ymd = (iso) => (/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')) || []).slice(1).join('');

/** Ngăn lộ: "AT1, 231" -> "AT1-231"; không ghi riêng thì lấy thiết bị/ngăn lộ nhắc tới trong nội dung. */
function baysPart(bays, fallbackText) {
  const list = String(bays || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  const found = list.length ? list : devicesIn(fallbackText);
  // "275" thừa khi đã có "TU275" / "MC 275"
  const squash = (s) => s.replace(/\s+/g, '');
  const kept = found.filter(d => !found.some(o => squash(o) !== squash(d) && squash(o).endsWith(squash(d))));
  return part(kept.join(' '), 40);
}

/**
 * type: registration | survey | plan | confirmation
 * doc: { date (YYYY-MM-DD…), number, bays, bayText (nội dung để tìm ngăn lộ), station }
 */
function docxFileName(type, { date, number, bays, bayText, station }) {
  const tba = String(station || '').trim().replace(/^(trạm biến áp|trạm)\s+/i, 'TBA ');
  const parts = [ymd(date), part(number, 40), TYPES[type], baysPart(bays, bayText), part(tba, 50)].filter(Boolean);
  return `${parts.join('_')}.docx`;
}

/** Header Content-Disposition cho file Word: filename= bỏ dấu (header chỉ nhận ASCII), filename*= giữ tên UTF-8. */
const attachment = (name) => `attachment; filename="${ascii(name).replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;

module.exports = { docxFileName, attachment, TYPES };
