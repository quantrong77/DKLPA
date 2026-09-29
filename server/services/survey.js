/**
 * Quy tắc nghiệp vụ của Biên bản khảo sát hiện trường (BBKSHT), thuần, không truy cập DB.
 *
 * Đại diện là { honorific: 'Ông'|'Bà', name, role } (ghi tay, không gắn danh mục ATĐ);
 * mục 8 (đánh giá rủi ro) cùng dạng { hazard, measures, performer } với thư viện rủi ro.
 */
const { text, time, checkLength } = require('./registration');

const LIMITS = { workUnitReps: 10, qlvhReps: 10, scopeItems: 50, risks: 100, diagramMarks: 20 };

/**
 * Khung "Khu vực công tác" trên ảnh sơ đồ: tọa độ tương đối (0–1) theo ảnh, { x, y, w, h, label }.
 * Bỏ khung nằm ngoài ảnh hoặc quá nhỏ; cắt phần tràn ra ngoài ảnh.
 */
function normalizeMarks(list) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
  const round = (v) => Math.round(v * 10000) / 10000;
  return (Array.isArray(list) ? list : []).map(m => {
    const x = num(m?.x);
    const y = num(m?.y);
    if (!(x >= 0 && x < 1 && y >= 0 && y < 1)) return null;
    const w = Math.min(num(m?.w), 1 - x);
    const h = Math.min(num(m?.h), 1 - y);
    if (!(w >= 0.005 && h >= 0.005)) return null;
    return { x: round(x), y: round(y), w: round(w), h: round(h), label: text(m?.label).replace(/\s+/g, ' ').slice(0, 100) };
  }).filter(Boolean);
}
const HONORIFICS = ['Ông', 'Bà'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkLimits(input) {
  for (const [key, max] of Object.entries(LIMITS)) {
    if (Array.isArray(input[key]) && input[key].length > max) return { field: key, message: `Danh sách "${key}" vượt quá ${max} mục.` };
  }
  return null;
}

const list = (v) => (Array.isArray(v) ? v : []);

function normalizeReps(input, field, errors) {
  return list(input)
    .map((r, i) => ({
      honorific: HONORIFICS.includes(r?.honorific) ? r.honorific : 'Ông',
      name: checkLength(text(r?.name).replace(/\s+/g, ' '), `${field}.${i}.name`, 'Họ tên', errors),
      role: checkLength(text(r?.role), `${field}.${i}.role`, 'Chức vụ', errors)
    }))
    .filter(r => r.name);
}

/**
 * Trạm khảo sát: chọn TBA trong danh mục (lấy tên + đơn vị QLVH từ danh mục) hoặc tự ghi tên.
 * substations: Map id -> { id, name, stationId, unitName }.
 */
function resolveStation(input = {}, substations) {
  const s = input?.substationId && substations.get(String(input.substationId));
  if (s) return { substationId: s.id, name: text(s.name), qlvhUnitId: s.stationId, qlvhUnitName: text(s.unitName) };
  return { substationId: null, name: text(input?.name), qlvhUnitId: null, qlvhUnitName: '' };
}

function normalizeSurvey(input = {}, { substations }) {
  const limitError = checkLimits(input || {});
  if (limitError) return { data: null, errors: [limitError] };
  const errors = [];
  const header = input.header || {};

  const surveyTime = time(input.surveyTime);
  if (!surveyTime) errors.push({ field: 'surveyTime', message: 'Ghi thời điểm khảo sát.' });
  const station = resolveStation(input.station, substations);
  checkLength(station.name, 'station', 'Tên trạm', errors);
  if (!station.name) errors.push({ field: 'station', message: 'Chọn hoặc ghi trạm biến áp nơi khảo sát.' });

  const workUnitReps = normalizeReps(input.workUnitReps, 'workUnitReps', errors);
  if (!workUnitReps.length) errors.push({ field: 'workUnitReps', message: 'Cần ít nhất một đại diện đơn vị công tác.' });
  const qlvhReps = normalizeReps(input.qlvhReps, 'qlvhReps', errors);

  const equipment = text(input.equipment);
  if (!equipment) errors.push({ field: 'equipment', message: 'Ghi địa điểm (hoặc thiết bị) thực hiện công việc.' });
  const workContent = text(input.workContent);
  if (!workContent) errors.push({ field: 'workContent', message: 'Ghi nội dung công việc.' });

  const data = {
    header: {
      unitName: checkLength(text(header.unitName), 'header.unitName', 'Đơn vị cấp trên', errors),
      teamName: checkLength(text(header.teamName), 'header.teamName', 'Tổ', errors),
      teamShort: checkLength(text(header.teamShort), 'header.teamShort', 'Tên viết tắt của tổ', errors)
    },
    surveyTime,
    station,
    workUnitReps,
    qlvhReps,
    relatedUnits: text(input.relatedUnits),
    equipment,
    workContent,
    scopeItems: list(input.scopeItems).map(text).filter(Boolean),
    timeText: text(input.timeText),
    risks: list(input.risks)
      .map(r => ({ hazard: text(r?.hazard), measures: text(r?.measures), performer: text(r?.performer) }))
      .filter(r => r.hazard || r.measures),
    diagramMarks: normalizeMarks(input.diagramMarks),
    diagramDate: DATE_RE.test(text(input.diagramDate)) ? text(input.diagramDate) : (surveyTime ? surveyTime.slice(0, 10) : null),
    outageId: input.outageId ? text(input.outageId).slice(0, 64) : null
  };
  return { data, errors };
}

/**
 * Biên bản nháp từ một dòng lịch cắt điện: nội dung, địa điểm, phạm vi và biện pháp cô lập.
 * substation: TBA trong danh mục khớp với địa điểm của lịch (nếu có) -> gắn luôn đơn vị QLVH.
 */
function surveyFromOutage(outage, substation = null) {
  const scope = text(outage.scope);
  return {
    outageId: outage.id,
    station: substation
      ? { substationId: substation.id, name: text(substation.name), qlvhUnitId: substation.stationId, qlvhUnitName: text(substation.unitName) }
      : { substationId: null, name: text(outage.location), qlvhUnitId: null, qlvhUnitName: '' },
    workContent: text(outage.content),
    scopeItems: scope ? scope.split('\n').map(s => s.trim()).filter(Boolean) : [],
    risks: scope ? [{ hazard: 'Chuẩn bị biện pháp kỹ thuật an toàn để làm việc', measures: scope, performer: 'Đơn vị QLVH' }] : []
  };
}

module.exports = { normalizeSurvey, surveyFromOutage, normalizeMarks, LIMITS };
