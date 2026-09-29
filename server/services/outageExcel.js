/**
 * Đọc file Excel "LỊCH CẮT ĐIỆN" thành các dòng lịch cắt điện.
 *
 * Hai mẫu đang lưu hành:
 *  - 10 cột: "Thời gian đăng ký" (Bắt đầu/Kết thúc) + "Thời gian thực tế" (Bắt đầu/Kết thúc), tiêu đề 2 tầng
 *  - 8 cột:  "Thời gian bắt đầu" / "Thời gian kết thúc"
 * Cột được nhận theo tên tiêu đề nên thứ tự cột có thể thay đổi giữa các kỳ.
 * Thời gian trả về dạng giờ địa phương "YYYY-MM-DDTHH:mm" (không múi giờ).
 */
const crypto = require('node:crypto');
const XLSX = require('xlsx');

const pad = (n) => String(n).padStart(2, '0');

function toLocalIso(y, mo, d, h, mi) {
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59) return null;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`;
}

/** Excel serial (ngày tính từ 1899-12-30) hoặc Date của exceljs (giờ tường lưu dạng UTC). */
function fromDate(date) {
  if (Number.isNaN(date.getTime())) return null;
  return toLocalIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes());
}

function parseOutageTime(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return fromDate(value);
  if (typeof value === 'number') {
    if (value < 1) return null; // chỉ có giờ, không có ngày
    const ms = Math.round((value - 25569) * 86400 * 1000 / 60000) * 60000;
    return fromDate(new Date(ms));
  }
  const m = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2})\s*(?:h|:)\s*(\d{1,2})?)?$/i);
  if (!m) return null;
  return toLocalIso(Number(m[3]), Number(m[2]), Number(m[1]), Number(m[4] || 0), Number(m[5] || 0));
}

const cleanText = (v) => (v === null || v === undefined ? '' : String(v).replace(/\r\n?/g, '\n').trim());
const norm = (v) => cleanText(v).toLowerCase().replace(/\s+/g, ' ');

const TEXT_COLUMNS = [
  ['location', 'địa điểm'],
  ['content', 'nội dung'],
  ['scope', 'phạm vi'],
  ['registrationUnit', 'đơn vị đăng ký'],
  ['workUnit', 'đơn vị công tác'],
  ['status', 'tình trạng']
];

/** Tìm dòng tiêu đề và vị trí từng cột; null nếu không phải mẫu lịch cắt điện. */
function detectLayout(matrix) {
  for (let r = 0; r < Math.min(matrix.length, 20); r++) {
    const header = (matrix[r] || []).map(norm);
    if (!header.some(h => h.startsWith('địa điểm')) || !header.some(h => h.startsWith('nội dung'))) continue;

    const cols = {};
    for (const [key, label] of TEXT_COLUMNS) {
      const idx = header.findIndex(h => h.startsWith(label));
      if (idx >= 0) cols[key] = idx;
    }
    const sub = (matrix[r + 1] || []).map(norm);
    const hasSubHeader = sub.some(h => h === 'bắt đầu');
    const regIdx = header.findIndex(h => h.startsWith('thời gian đăng ký'));
    const actIdx = header.findIndex(h => h.startsWith('thời gian thực tế'));
    if (regIdx >= 0 && hasSubHeader) {
      cols.regStart = regIdx;
      cols.regEnd = regIdx + 1;
      if (actIdx >= 0) { cols.actualStart = actIdx; cols.actualEnd = actIdx + 1; }
    } else {
      cols.regStart = header.findIndex(h => h.includes('bắt đầu'));
      cols.regEnd = header.findIndex(h => h.includes('kết thúc'));
    }
    if (cols.regStart < 0 || cols.regEnd < 0) continue;
    return { cols, dataStart: r + (hasSubHeader ? 2 : 1) };
  }
  return null;
}

function rowHash(row) {
  const key = [row.regStart, row.regEnd, row.location, row.content, row.scope].map(v => norm(v)).join('|');
  return crypto.createHash('sha1').update(key).digest('hex');
}

function parseOutageMatrix(matrix) {
  const layout = detectLayout(matrix);
  if (!layout) {
    throw Object.assign(new Error('Không tìm thấy dòng tiêu đề của lịch cắt điện (cần các cột "Địa điểm", "Nội dung", thời gian bắt đầu/kết thúc).'), { status: 400 });
  }
  const { cols, dataStart } = layout;
  const rows = [];
  const errors = [];
  const seen = new Set();
  let duplicates = 0;

  for (let r = dataStart; r < matrix.length; r++) {
    const cells = matrix[r] || [];
    if (cells.every(v => cleanText(v) === '')) continue;
    const sourceRow = r + 1;
    const cell = (idx) => (idx === undefined || idx < 0 ? null : cells[idx]);

    const row = { sourceRow };
    for (const [key] of TEXT_COLUMNS) row[key] = cleanText(cell(cols[key]));
    row.regStart = parseOutageTime(cell(cols.regStart));
    row.regEnd = parseOutageTime(cell(cols.regEnd));
    row.actualStart = parseOutageTime(cell(cols.actualStart));
    row.actualEnd = parseOutageTime(cell(cols.actualEnd));

    let message = null;
    if (!row.regStart) message = `Thời gian bắt đầu không hợp lệ: "${cleanText(cell(cols.regStart))}"`;
    else if (!row.regEnd) message = `Thời gian kết thúc không hợp lệ: "${cleanText(cell(cols.regEnd))}"`;
    else if (!row.content) message = 'Thiếu nội dung công việc';
    else if (row.regEnd <= row.regStart) message = 'Thời gian kết thúc phải sau thời gian bắt đầu';
    if (message) {
      errors.push({ row: sourceRow, message });
      continue;
    }

    row.rowHash = rowHash(row);
    if (seen.has(row.rowHash)) { duplicates++; continue; }
    seen.add(row.rowHash);
    rows.push(row);
  }
  return { rows, errors, duplicates };
}

// Lịch cắt điện một kỳ chỉ vài trăm dòng, 8–10 cột. Giới hạn cứng để một file cố ý khai
// ô ở XFD1048576 không làm tràn bộ nhớ và sập cả ChatLan.
const MAX_ROWS = 3000;
const MAX_COLS = 50;
const tooLarge = () => Object.assign(new Error(`File quá lớn: lịch cắt điện tối đa ${MAX_ROWS} dòng, ${MAX_COLS} cột.`), { status: 400 });

/** Vùng dữ liệu thật (file lịch xuất từ hệ thống ghi sai <dimension>, vd A1:J5 dù có 69 dòng), có chặn trên. */
function actualRange(sheet) {
  const range = { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  for (const key of Object.keys(sheet)) {
    if (key[0] === '!') continue;
    const { r, c } = XLSX.utils.decode_cell(key);
    if (r > range.e.r) range.e.r = r;
    if (c > range.e.c) range.e.c = Math.min(c, MAX_COLS - 1);
  }
  return XLSX.utils.encode_range(range);
}

// xlsx là tệp zip (PK\x03\x04), xls là OLE2 (D0 CF 11 E0): không nhận CSV/HTML/SYLK đổi đuôi
function isExcelBinary(buffer) {
  const b = buffer.subarray(0, 4);
  return (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04)
    || (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0);
}

/**
 * Buffer .xlsx/.xls -> ma trận giá trị của trang tính đầu tiên -> parseOutageMatrix.
 * Dùng SheetJS vì file lịch xuất từ hệ thống dùng tiền tố namespace "x:" mà exceljs không đọc được.
 * Ngày kiểu số được giữ dạng serial để parseOutageTime tự đổi (không lệ thuộc múi giờ máy chủ).
 */
async function readOutageWorkbook(buffer) {
  const invalid = () => Object.assign(new Error('File không phải Excel (.xlsx/.xls) hợp lệ.'), { status: 400 });
  if (!Buffer.isBuffer(buffer) || !isExcelBinary(buffer)) throw invalid();
  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer', cellDates: false, cellHTML: false, cellFormula: false, cellStyles: false,
      sheets: 0, sheetRows: MAX_ROWS + 1
    });
  } catch (e) {
    throw invalid();
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw Object.assign(new Error('File Excel không có trang tính nào.'), { status: 400 });
  // sheetRows chỉ đọc MAX_ROWS+1 dòng; '!fullref' là vùng file tự khai
  const declared = sheet['!fullref'] ? XLSX.utils.decode_range(sheet['!fullref']) : null;
  if (declared && (declared.e.r >= MAX_ROWS || declared.e.c >= MAX_COLS)) {
    // file lịch thật hay khai sai vùng nhỏ hơn, không lớn hơn — khai vùng khổng lồ là file bất thường
    throw tooLarge();
  }
  sheet['!ref'] = actualRange(sheet);
  if (XLSX.utils.decode_range(sheet['!ref']).e.r >= MAX_ROWS) throw tooLarge();
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: true });
  return parseOutageMatrix(matrix);
}

module.exports = { parseOutageTime, parseOutageMatrix, readOutageWorkbook };
