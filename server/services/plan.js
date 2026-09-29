/**
 * Quy tắc nghiệp vụ của Phương án thi công, biện pháp an toàn (thí nghiệm) — thuần, không truy cập DB.
 *
 * Bảng 1 "Hạng mục thí nghiệm" lưu dạng các nhóm thiết bị { deviceKey, cycle, label, items[] } do giao diện
 * lập từ QĐ 1901 (seeds/tests1901.json) rồi người lập tick bỏ/thêm; phương án lưu bản chụp này.
 */
const { text, time, checkLength, resolvePerson } = require('./registration');

const LIMITS = {
  legalBases: 20, workloads: 30, isolationSteps: 50, risks: 100, people: 100, recipients: 20,
  isolationDevices: 300, testGroups: 60, instruments: 100, ctBlocks: 30
};
const MAX_GROUP_ITEMS = 100;
const CYCLES = ['install', 'year1', 'annual', 'y3', 'y6'];
const list = (v) => (Array.isArray(v) ? v : []);
const lines = (v) => list(v).map(text).filter(Boolean);
const intIn = (v, min, max, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

function checkLimits(input) {
  for (const [key, max] of Object.entries(LIMITS)) {
    if (Array.isArray(input[key]) && input[key].length > max) return { field: key, message: `Danh sách "${key}" vượt quá ${max} mục.` };
  }
  const g = list(input.testGroups).findIndex(x => list(x?.items).length > MAX_GROUP_ITEMS);
  if (g >= 0) return { field: `testGroups.${g}.items`, message: `Nhóm thiết bị ${g + 1}: tối đa ${MAX_GROUP_ITEMS} hạng mục.` };
  return null;
}

function normalizeStation(input = {}, substations) {
  const s = input?.substationId && substations.get(String(input.substationId));
  if (s) {
    return { substationId: s.id, name: text(s.name), qlvhUnitId: s.stationId, qlvhUnitName: text(s.unitName), qlvhShort: text(s.unitShort) };
  }
  return { substationId: null, name: text(input?.name), qlvhUnitId: null, qlvhUnitName: text(input?.qlvhUnitName), qlvhShort: text(input?.qlvhShort) };
}

const MAX_DRAWINGS = 10;
/**
 * Sơ đồ trạm in ở Phụ lục IV (TBA 500kV có thể có sơ đồ phía 500kV, phía 220kV): danh sách id theo thứ tự in.
 * null = chưa chọn (phương án lập trước khi có tính năng này) -> in tất cả sơ đồ của trạm.
 */
function drawingIds(value, station) {
  if (!Array.isArray(value)) return null;
  if (!station.substationId) return [];
  return [...new Set(value.map(v => text(v).slice(0, 64)).filter(Boolean))].slice(0, MAX_DRAWINGS);
}

function normalizePlan(input = {}, { personnel, substations }) {
  const limitError = checkLimits(input || {});
  if (limitError) return { data: null, errors: [limitError] };
  const errors = [];
  const h = input.header || {};
  const header = {};
  for (const [key, label] of [['companyName', 'Công ty'], ['unitName', 'Đội'], ['teamName', 'Tổ'], ['teamShort', 'Tên viết tắt tổ'],
    ['transmissionName', 'Truyền tải điện'], ['place', 'Địa danh'], ['numberSuffix', 'Hậu tố số phương án']]) {
    header[key] = checkLength(text(h[key]), `header.${key}`, label, errors);
  }
  header.date = /^\d{4}-\d{2}-\d{2}$/.test(text(h.date)) ? text(h.date) : null;

  const workType = checkLength(text(input.workType), 'workType', 'Loại công tác', errors);
  if (!workType) errors.push({ field: 'workType', message: 'Ghi loại công tác (vd Thí nghiệm định kỳ).' });
  const equipmentText = text(input.equipmentText);
  if (!equipmentText) errors.push({ field: 'equipmentText', message: 'Ghi thiết bị/ngăn lộ công tác.' });
  const bays = text(input.bays);
  if (!bays) errors.push({ field: 'bays', message: 'Ghi các ngăn lộ cắt điện cô lập.' });
  const station = normalizeStation(input.station, substations);
  checkLength(station.name, 'station', 'Tên trạm', errors);
  if (!station.name) errors.push({ field: 'station', message: 'Chọn hoặc ghi trạm biến áp.' });

  const people = [];
  list(input.people).forEach((p, i) => {
    const person = resolvePerson(p?.person, personnel, `people.${i}`, errors);
    if (person) people.push({ person, duty: checkLength(text(p?.duty), `people.${i}.duty`, 'Nhiệm vụ', errors) });
  });

  const data = {
    header,
    workType,
    year: intIn(input.year, 2000, 2100, null),
    equipmentText,
    bays,
    station,
    drawingIds: drawingIds(input.drawingIds, station),
    time: { start: time(input.time?.start), end: time(input.time?.end) },
    approvalRef: text(input.approvalRef),
    legalBases: lines(input.legalBases),
    workloads: lines(input.workloads),
    isolationSteps: lines(input.isolationSteps),
    ctIsolation: text(input.ctIsolation),
    liveDisconnectors: text(input.liveDisconnectors),
    risks: list(input.risks)
      .map(r => ({ hazard: text(r?.hazard), measures: text(r?.measures), performer: text(r?.performer) }))
      .filter(r => r.hazard || r.measures),
    people,
    reserve: text(input.reserve),
    teamLeader: checkLength(text(input.teamLeader), 'teamLeader', 'Tổ trưởng/Tổ phó', errors),
    recipients: lines(input.recipients),
    isolationDevices: lines(input.isolationDevices).map(s => s.slice(0, 100)),
    testGroups: list(input.testGroups).map(g => ({
      deviceKey: text(g?.deviceKey).slice(0, 32),
      cycle: CYCLES.includes(g?.cycle) ? g.cycle : null,
      label: checkLength(text(g?.label), 'testGroups', 'Tên nhóm thiết bị', errors),
      items: list(g?.items)
        .map(it => ({ name: text(it?.name), note: text(it?.note), level: it?.level === 1 ? 1 : 0, checked: it?.checked !== false }))
        .filter(it => it.name)
    })).filter(g => g.label || g.items.length),
    instruments: list(input.instruments)
      .map(x => ({ group: text(x?.group).slice(0, 100), name: text(x?.name), unit: text(x?.unit).slice(0, 20), qty: text(x?.qty).slice(0, 20), note: text(x?.note) }))
      .filter(x => x.name),
    ctBlocks: list(input.ctBlocks).map(b => ({
      title: text(b?.title),
      panel: text(b?.panel).slice(0, 100),
      prefix: text(b?.prefix || 'XA').slice(0, 10),
      firstCore: intIn(b?.firstCore, 1, 99, 1),
      cores: intIn(b?.cores, 1, 20, 1),
      side: b?.side === 'S1S4' ? 'S1S4' : 'S2S3'
    })).filter(b => b.title || b.panel),
    surveyId: input.surveyId ? text(input.surveyId).slice(0, 64) : null,
    outageId: input.outageId ? text(input.outageId).slice(0, 64) : null
  };
  return { data, errors };
}

module.exports = { normalizePlan, LIMITS, CYCLES };
