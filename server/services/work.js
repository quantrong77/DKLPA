/**
 * Công việc không có lịch cắt điện (làm việc không cắt điện, kiểm tra, xử lý tồn tại…): gốc của luồng chuẩn bị công tác
 * thay cho dòng lịch. Biên bản KSHT, phương án, giấy ĐKCT lập từ công việc được điền sẵn trạm, nội dung, thời gian
 * và gắn workId. Thuần, không truy cập DB (trừ loadVisibleWork).
 */
const { text, time, checkLength } = require('./registration');
const { forbidden } = require('../policy');

const MAX_TEXT = 4000;
/** Điều kiện mặc định của công việc mới. */
const DEFAULT_SCOPE = 'Không cắt điện.';

function longText(value, field, label, errors) {
  if (value.length > MAX_TEXT) errors.push({ field, message: `${label} dài quá ${MAX_TEXT} ký tự.` });
  return value;
}

/**
 * Dữ liệu công việc gửi lên -> { data, errors }. Trạm chọn từ danh mục (substations: Map id -> { id, name }) hoặc tự ghi.
 */
function normalizeWork(input = {}, { substations }) {
  const errors = [];
  const content = longText(text(input.content), 'content', 'Nội dung công việc', errors);
  if (!content) errors.push({ field: 'content', message: 'Ghi nội dung công việc.' });
  const s = input.substationId && substations.get(String(input.substationId));
  const stationName = checkLength(s ? text(s.name) : text(input.stationName), 'stationName', 'Tên trạm', errors);
  const location = longText(text(input.location), 'location', 'Địa điểm / thiết bị', errors);
  if (!stationName && !location) errors.push({ field: 'stationName', message: 'Chọn trạm hoặc ghi địa điểm công tác.' });
  const startTime = time(input.startTime);
  const endTime = time(input.endTime);
  if (text(input.startTime) && !startTime) errors.push({ field: 'startTime', message: 'Thời gian bắt đầu không hợp lệ.' });
  if (text(input.endTime) && !endTime) errors.push({ field: 'endTime', message: 'Thời gian kết thúc không hợp lệ.' });
  if (startTime && endTime && endTime < startTime) errors.push({ field: 'endTime', message: 'Thời gian kết thúc phải sau thời gian bắt đầu.' });
  const data = {
    content,
    substationId: s ? s.id : null,
    stationName,
    location,
    scope: longText(text(input.scope), 'scope', 'Điều kiện / phạm vi làm việc', errors),
    startTime,
    endTime,
    note: longText(text(input.note), 'note', 'Ghi chú', errors)
  };
  return { data, errors };
}

/** Địa điểm ghi trên giấy: "Ngăn 271, TBA 220kV Bảo Lộc". */
const placeOf = (work) => [text(work.location), text(work.stationName)].filter(Boolean).join(', ');

// "2026-10-10T08:00" -> "08h00 ngày 10/10/2026"
const vnTime = (t) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(t || ''));
  return m ? `${m[4]}h${m[5]} ngày ${m[3]}/${m[2]}/${m[1]}` : '';
};
/** Mục "thời gian" của biên bản KSHT: theo giờ của công việc, chưa có giờ thì theo kế hoạch. */
function timeTextOf(work) {
  const [a, b] = [vnTime(work.startTime), vnTime(work.endTime)];
  if (a && b) return `từ ${a} đến ${b}.`;
  if (a) return `từ ${a}.`;
  return 'theo kế hoạch được duyệt.';
}

/**
 * Công việc dưới dạng một "dòng lịch" để dùng lại các hàm lập nháp từ lịch cắt điện
 * (draftFromOutage, surveyFromOutage…). Địa điểm là tên trạm (để khớp danh mục TBA).
 */
function workAsOutage(work) {
  return {
    id: work.id,
    content: work.content,
    location: work.stationName || work.location,
    scope: work.scope,
    regStart: work.startTime,
    regEnd: work.endTime
  };
}

/** Công việc `id` mà người xem được phép xem (cùng tổ hoặc admin); không có -> 404, tổ khác -> 403. */
async function loadVisibleWork(db, policy, actor, id) {
  const work = await db.queryOne('SELECT * FROM dkct_works WHERE id = ?', [id]);
  if (!work) throw Object.assign(new Error('Không tìm thấy công việc.'), { status: 404 });
  if (!policy.canView(actor, work)) throw forbidden('Công việc này thuộc đơn vị khác.');
  return work;
}

module.exports = { normalizeWork, workAsOutage, placeOf, timeTextOf, loadVisibleWork, DEFAULT_SCOPE };
