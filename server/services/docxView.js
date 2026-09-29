/**
 * Dữ liệu giấy ĐKCT -> các giá trị điền vào thẻ của templates/template_dkct.docx.
 * Cách ghi (dòng chấm khi trống, "6.1) 07/ng", "9.1) … - Bậc ATĐ 5/5") theo đúng mẫu.
 */

const DOTS_NAME = '....................................';
const DOTS_WATCHMAN = '.................................................';
const DOTS_UNIT = '..................................';
const pad2 = (n) => String(n).padStart(2, '0');

function parts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(iso || '');
  return m ? { y: m[1], mo: m[2], d: m[3], h: m[4], mi: m[5] } : null;
}

function formatDateTimeVi(iso) {
  const p = parts(iso);
  if (!p) return '..... giờ ..... ngày ..... tháng ..... năm .....';
  return `${p.h} giờ ${p.mi} ngày ${p.d} tháng ${p.mo} năm ${p.y}`;
}

function formatShort(iso) {
  const p = parts(iso);
  return p ? `${p.h}:${p.mi} ${p.d}/${p.mo}/${p.y}` : '';
}

/** "Đội Sửa chữa, thí nghiệm điện 3" -> ["ĐỘI SỬA CHỮA,", "THÍ NGHIỆM ĐIỆN 3"]: ngắt sau dấu phẩy, nếu không thì trước 2 từ cuối. */
function splitHeaderLine(name) {
  const upper = String(name || '').trim().toLocaleUpperCase('vi');
  if (!upper) return ['', ''];
  const comma = upper.indexOf(',');
  if (comma > 0 && comma < upper.length - 1) return [upper.slice(0, comma + 1).trim(), upper.slice(comma + 1).trim()];
  const words = upper.split(/\s+/);
  if (words.length <= 3) return [upper, ''];
  return [words.slice(0, -2).join(' '), words.slice(-2).join(' ')];
}

const level = (p) => (p && p.safetyLevel ? p.safetyLevel : '.../5');
const numbered = (prefix, list, fmt) => list.map((x, i) => `${prefix}.${i + 1}) ${fmt(x)}`).join('; ');
const withLevel = (p) => `${p.name} - Bậc ATĐ ${level(p)}`;

// Chỉ 1 ĐVCT thì không đánh số ("07/ng", "Trần Văn Hoàng - Bậc ATĐ 5/5", phiếu "01");
// từ 2 ĐVCT trở lên đánh số như mẫu ("6.1) 07/ng; 6.2) …", "(ĐVCT2)", "…đơn vị công tác 2").
function workerCountsLine(units) {
  return units.map(u => {
    const extra = [u.location, u.start && u.end ? `${formatShort(u.start)} - ${formatShort(u.end)}` : '']
      .filter(Boolean).join(', ');
    const prefix = units.length > 1 ? `6.${u.seq}) ` : '';
    return `${prefix}${pad2(u.memberCount)}/ng${extra ? ` (${extra})` : ''}`;
  }).join('; ');
}

/** Bỏ số ĐVCT trong nhiệm vụ khi giấy chỉ có 1 ĐVCT: "…đơn vị công tác 1" -> "…đơn vị công tác". */
const dropUnitNumber = (duty) => String(duty || '').replace(/(đơn vị công tác|ĐVCT)\s*1(?!\d)/gi, '$1');

function toDocxView({ docNumber, data }) {
  const [unitLine1, unitLine2] = splitHeaderLine(data.header?.unitName);
  const [teamLine1, teamLine2] = splitHeaderLine(data.header?.teamName);
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data.header?.date || '');
  const rep = data.representative || {};
  const units = data.workUnits || [];
  const watchmen = data.watchmen || [];
  const supervisors = data.supervisors || [];
  const others = data.otherUnits || [];

  return {
    unitLine1, unitLine2, teamLine1, teamLine2,
    // "Tổ Thí nghiệm điện Lâm Đồng - Đội Sửa chữa, thí nghiệm điện 3", bỏ phần trống
    orgName: [data.header?.teamName, data.header?.unitName].filter(Boolean).join(' - '),
    place: data.header?.place || '.....',
    day: date ? String(Number(date[3])) : '.....',
    month: date ? String(Number(date[2])) : '.....',
    year: date ? date[1] : '.....',
    docNumber: docNumber || '.....',
    recipientName: data.recipient?.name || '',
    basis: data.header?.basis || '... (Biên bản khảo sát hiện trường/Đánh giá rủi ro) ...',
    repHonorific: rep.honorific || 'Ông',
    repName: rep.name || '',
    repRole: rep.role || '',
    repContact: rep.contact || '',
    workContent: data.workContent?.text || '',
    workLocation: data.workLocation || '',
    condition: data.condition?.text || '',
    startText: formatDateTimeVi(data.time?.start),
    endText: formatDateTimeVi(data.time?.end),
    workUnitCount: pad2(units.length),
    workerCountsLine: workerCountsLine(units),
    leaderName: data.leader ? data.leader.name : DOTS_NAME,
    leaderLevel: level(data.leader),
    supervisorsLine: supervisors.length
      ? numbered('8', supervisors, withLevel)
      : `8.1) ${DOTS_NAME} Bậc ATĐ .../5`,
    commandersLine: units.length === 1
      ? (units[0].commander ? withLevel(units[0].commander) : `${DOTS_NAME} Bậc ATĐ .../5`)
      : numbered('9', units, u => (u.commander ? withLevel(u.commander) : `${DOTS_NAME} Bậc ATĐ .../5`)),
    watchmanName: watchmen.length ? watchmen.map(w => w.name).join('; ') : DOTS_WATCHMAN,
    watchmanLevel: watchmen.length ? watchmen.map(level).join('; ') : '.../5',
    otherUnitsLine: others.length
      ? others.map((u, i) => `12.${i + 1}. ${u}`).join('; ')
      : `12.1. ${DOTS_UNIT}    12.2. ${DOTS_UNIT}`,
    signatoryName: data.signatoryName || rep.name || '',
    nominees: (data.nominees || []).map(n => ({ name: n.person.name, card: n.card, duty: units.length === 1 ? dropUnitNumber(n.duty) : n.duty })),
    permits: (data.permits || []).map(p => ({
      isolation: p.isolation,
      permitNo: units.length > 1 ? `${pad2(p.permitNo)}\n(ĐVCT${p.workUnitSeq ?? ''})` : pad2(p.permitNo),
      content: p.content,
      commander: p.commander ? p.commander.name : '',
      workers: p.workers.map(w => `- ${w.name}`).join('\n'),
      note: p.note
    })),
    risks: (data.risks || []).map(r => ({ hazard: r.hazard, measures: r.measures, performer: r.performer }))
  };
}

module.exports = { toDocxView, formatDateTimeVi, splitHeaderLine };
