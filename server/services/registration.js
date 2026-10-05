/**
 * Quy tắc nghiệp vụ của Giấy ĐKCT (thuần, không truy cập DB).
 *
 * Mọi vị trí nhân sự là một PersonRef { personnelId, name, safetyLevel, safetyCard }:
 *  - chọn từ danh mục (personnelId) -> tên/bậc/thẻ luôn chụp lại từ danh mục phía server
 *  - tự ghi (personnelId = null)   -> giữ tên/bậc người dùng nhập
 * Giấy lưu bản chụp này nên in lại vẫn đúng như lúc lập, dù danh mục đổi sau đó.
 */

// Ký tự điều khiển dán từ Word/Excel (\v, \f, …) làm file DOCX xuất ra bị hỏng
// Một mục của giấy không cần dài hơn MAX_TEXT ký tự (chặn body làm phình DOCX/CSDL)
const MAX_TEXT = 5000;
const text = (v) => (v === null || v === undefined ? ''
  : String(v).slice(0, MAX_TEXT * 2).replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, MAX_TEXT));
const MAX_NAME = 255;
function checkLength(value, field, label, errors) {
  if (value.length > MAX_NAME) errors.push({ field, message: `${label} dài quá ${MAX_NAME} ký tự.` });
  return value;
}
const TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const time = (v) => (TIME_RE.test(text(v)) ? text(v) : null);
const source = (v) => (v === 'outage' ? 'outage' : 'manual');

function formatCard({ safetyLevel, safetyCard } = {}) {
  const level = text(safetyLevel);
  const card = text(safetyCard);
  if (level && card) return `${level} _ ${card}`;
  return level || card;
}

function personKey(p) {
  if (p?.personnelId) return `id:${p.personnelId}`;
  return `name:${text(p?.name).toLowerCase().replace(/\s+/g, ' ')}`;
}

/** PersonRef đã chuẩn hóa, null nếu để trống; ném {field} nếu chọn người không còn trong danh mục. */
function resolvePerson(input, personnel, field, errors) {
  if (!input) return null;
  if (input.personnelId) {
    const p = personnel.get(String(input.personnelId));
    if (!p) {
      errors.push({ field, message: 'Người được chọn không còn trong danh mục nhân sự.' });
      return null;
    }
    return { personnelId: p.id, name: text(p.fullName), safetyLevel: text(p.safetyLevel), safetyCard: text(p.safetyCard) };
  }
  const name = checkLength(text(input.name).replace(/\s+/g, ' '), field, 'Họ tên', errors);
  if (!name) return null;
  return { personnelId: null, name, safetyLevel: text(input.safetyLevel), safetyCard: text(input.safetyCard) };
}

function resolvePeople(list, personnel, field, errors) {
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((item, i) => {
    const p = resolvePerson(item, personnel, `${field}.${i}`, errors);
    if (p && !seen.has(personKey(p))) {
      seen.add(personKey(p));
      out.push(p);
    }
  });
  return out;
}

function resolveRecipient(input = {}, stations) {
  if (input.stationId && stations.has(String(input.stationId))) {
    const s = stations.get(String(input.stationId));
    return { stationId: s.id, name: text(s.name), email: text(s.email) };
  }
  return { stationId: null, name: text(input.name), email: text(input.email) };
}

function normalizeWorkUnits(list, personnel, errors) {
  const units = (Array.isArray(list) ? list : []).map((u, i) => {
    const before = errors.length;
    const commander = resolvePerson(u?.commander, personnel, `workUnits.${i}.commander`, errors);
    if (!commander && errors.length === before) {
      errors.push({ field: `workUnits.${i}.commander`, message: `ĐVCT ${i + 1}: bắt buộc có Người chỉ huy trực tiếp (CHTT).` });
    }
    const members = resolvePeople(u?.members, personnel, `workUnits.${i}.members`, errors)
      .filter(m => !commander || personKey(m) !== personKey(commander));
    return {
      seq: i + 1,
      commander,
      members,
      memberCount: members.length,
      location: text(u?.location),
      start: time(u?.start),
      end: time(u?.end)
    };
  });
  if (units.length === 0) errors.push({ field: 'workUnits', message: 'Phải có ít nhất 1 đơn vị công tác.' });
  units.forEach((u, i) => {
    if (u.start && u.end && u.end <= u.start) {
      errors.push({ field: `workUnits.${i}.time`, message: `ĐVCT ${i + 1}: thời gian kết thúc phải sau thời gian bắt đầu.` });
    }
  });
  return units;
}

function normalizeNominees(list, personnel, errors) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach((n, i) => {
    const person = resolvePerson(n?.person, personnel, `nominees.${i}`, errors);
    if (!person) return;
    out.push({ person, card: formatCard(person), duty: text(n?.duty) });
  });
  return out;
}

function normalizePermits(list, workUnits, registered, personnel, errors) {
  return (Array.isArray(list) ? list : [])
    .filter(p => text(p?.content) || text(p?.isolation))
    .map((p, i) => {
      const unit = workUnits.find(u => u.seq === Number(p?.workUnitSeq));
      if (!unit) errors.push({ field: `permits.${i}.workUnitSeq`, message: `Phiếu ${i + 1}: chọn ĐVCT (và CHTT) đã khai ở mục 9.` });
      const workers = resolvePeople(p?.workers, personnel, `permits.${i}.workers`, errors);
      const strangers = workers.filter(w => !registered.has(personKey(w)));
      if (strangers.length) {
        errors.push({
          field: `permits.${i}.workers`,
          message: `Phiếu ${i + 1}: ${strangers.map(s => s.name).join(', ')} chưa có trong danh sách đã đăng ký.`
        });
      }
      return {
        permitNo: i + 1,
        isolation: text(p?.isolation),
        workUnitSeq: unit ? unit.seq : null,
        commander: unit ? unit.commander : null,
        content: text(p?.content),
        workers,
        note: text(p?.note)
      };
    });
}

/**
 * input: dữ liệu form từ client; ctx: { personnel: Map<id, row>, stations: Map<id, row> }.
 * Trả { data, errors[] } — data luôn được trả để client hiển thị lại kể cả khi có lỗi.
 */
/** Số phần tử tối đa của từng danh sách — vượt quá thì từ chối ngay, trước mọi xử lý (chống treo server). */
const LIMITS = { workUnits: 20, supervisors: 10, watchmen: 10, otherUnits: 20, nominees: 200, permits: 100, risks: 100 };
const MAX_MEMBERS = 100;
const MAX_WORKERS = 200;

function checkLimits(input) {
  const over = (list, max) => Array.isArray(list) && list.length > max;
  for (const [key, max] of Object.entries(LIMITS)) {
    if (over(input[key], max)) return { field: key, message: `Danh sách "${key}" vượt quá ${max} mục.` };
  }
  const units = Array.isArray(input.workUnits) ? input.workUnits : [];
  const i = units.findIndex(u => over(u?.members, MAX_MEMBERS));
  if (i >= 0) return { field: `workUnits.${i}.members`, message: `ĐVCT ${i + 1}: tối đa ${MAX_MEMBERS} nhân viên.` };
  const permits = Array.isArray(input.permits) ? input.permits : [];
  const j = permits.findIndex(p => over(p?.workers, MAX_WORKERS));
  if (j >= 0) return { field: `permits.${j}.workers`, message: `Phiếu ${j + 1}: tối đa ${MAX_WORKERS} nhân viên.` };
  return null;
}

function normalizeRegistration(input = {}, ctx) {
  const limitError = checkLimits(input || {});
  if (limitError) return { data: null, errors: [limitError] };
  const errors = [];
  const { personnel, stations } = ctx;

  const recipient = resolveRecipient(input.recipient, stations);
  checkLength(recipient.name, 'recipient', 'Tên nơi nhận', errors);
  if (!recipient.name) errors.push({ field: 'recipient', message: 'Chọn hoặc ghi nơi nhận (đơn vị quản lý vận hành).' });

  const workContent = { text: text(input.workContent?.text), source: source(input.workContent?.source) };
  if (!workContent.text) errors.push({ field: 'workContent', message: 'Nội dung công việc là bắt buộc.' });

  const t = { start: time(input.time?.start), end: time(input.time?.end), source: source(input.time?.source) };
  if (!t.start || !t.end) errors.push({ field: 'time', message: 'Nhập đủ thời gian bắt đầu và kết thúc.' });
  else if (t.end <= t.start) errors.push({ field: 'time', message: 'Thời gian kết thúc phải sau thời gian bắt đầu.' });

  const leader = resolvePerson(input.leader, personnel, 'leader', errors);
  const supervisors = resolvePeople(input.supervisors, personnel, 'supervisors', errors);
  const watchmen = resolvePeople(input.watchmen, personnel, 'watchmen', errors);
  const workUnits = normalizeWorkUnits(input.workUnits, personnel, errors);
  const nominees = normalizeNominees(input.nominees, personnel, errors);

  const registered = new Set();
  for (const u of workUnits) {
    if (u.commander) registered.add(personKey(u.commander));
    u.members.forEach(m => registered.add(personKey(m)));
  }
  nominees.forEach(n => registered.add(personKey(n.person)));
  const permits = normalizePermits(input.permits, workUnits, registered, personnel, errors);

  const data = {
    outageId: input.outageId ? String(input.outageId) : null,
    // công việc không có lịch cắt điện; biên bản KSHT / phương án đã dùng để lập giấy (nối luồng khi không có lịch)
    workId: input.workId ? String(input.workId).slice(0, 64) : null,
    surveyId: input.surveyId ? String(input.surveyId).slice(0, 64) : null,
    planId: input.planId ? String(input.planId).slice(0, 64) : null,
    header: {
      unitName: text(input.header?.unitName),
      teamName: text(input.header?.teamName),
      place: text(input.header?.place),
      date: /^\d{4}-\d{2}-\d{2}$/.test(text(input.header?.date)) ? text(input.header.date) : null,
      basis: text(input.header?.basis)
    },
    representative: {
      honorific: text(input.representative?.honorific) || 'Ông',
      name: text(input.representative?.name),
      role: text(input.representative?.role),
      contact: text(input.representative?.contact)
    },
    recipient,
    workContent,
    workLocation: text(input.workLocation),
    condition: { text: text(input.condition?.text), source: source(input.condition?.source) },
    time: t,
    workUnitCount: workUnits.length,
    workUnits,
    leader,
    supervisors,
    watchmen,
    otherUnits: (Array.isArray(input.otherUnits) ? input.otherUnits : []).map(text).filter(Boolean),
    nominees,
    permits,
    risks: (Array.isArray(input.risks) ? input.risks : [])
      .map(r => ({ hazard: text(r?.hazard), measures: text(r?.measures), performer: text(r?.performer) }))
      .filter(r => r.hazard || r.measures),
    signatoryName: text(input.signatoryName) || text(input.representative?.name)
  };
  return { data, errors };
}

/** Giấy nháp điền sẵn từ một dòng lịch cắt điện. */
function draftFromOutage(outage) {
  return {
    outageId: outage.id,
    workContent: { text: text(outage.content), source: 'outage' },
    workLocation: text(outage.location),
    condition: { text: text(outage.scope), source: 'outage' },
    time: { start: outage.regStart || null, end: outage.regEnd || null, source: 'outage' },
    workUnits: [{ commander: null, members: [], location: '', start: null, end: null }],
    supervisors: [],
    watchmen: [],
    otherUnits: [],
    nominees: [],
    permits: [],
    risks: []
  };
}

module.exports = { normalizeRegistration, draftFromOutage, formatCard, personKey, text, time, checkLength, resolvePerson };
