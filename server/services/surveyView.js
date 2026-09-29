/**
 * Dữ liệu BBKSHT -> giá trị điền vào thẻ của templates/template_bbksht.docx.
 * Cách ghi theo mẫu: "09h30’ ngày 21/7/2026", "1.1. Ông: …, Chức vụ: …", dòng chấm khi để trống.
 */
const { splitHeaderLine } = require('./docxView');

const DOTS_SCOPE = '..............................';
const EMPTY_QLVH = '2.1. Ông (Bà): ................, Chức vụ: ............................';

function formatSurveyTime(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(iso || '');
  if (!m) return '.....h.....’ ngày ...../...../.....';
  return `${m[4]}h${m[5]}’ ngày ${Number(m[3])}/${Number(m[2])}/${m[1]}`;
}

function formatShortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : '...../...../.....';
}

const repLine = (prefix, r, i) => `${prefix}.${i + 1}. ${r.honorific || 'Ông'}: ${r.name}${r.role ? `, Chức vụ: ${r.role}` : ''}`;

function toSurveyView(data) {
  const header = data.header || {};
  const [unitLine1, unitLine2] = splitHeaderLine(header.unitName);
  const workUnitReps = data.workUnitReps || [];
  const qlvhReps = data.qlvhReps || [];
  const scope = data.scopeItems || [];
  return {
    unitLine1,
    unitLine2,
    teamUpper: String(header.teamName || '').trim().toLocaleUpperCase('vi'),
    surveyTimeText: formatSurveyTime(data.surveyTime),
    stationName: data.station?.name || '',
    workUnitRepLines: workUnitReps.map((r, i) => repLine('1', r, i)),
    qlvhRepLines: qlvhReps.length ? qlvhReps.map((r, i) => repLine('2', r, i)) : [EMPTY_QLVH],
    relatedUnits: data.relatedUnits || 'không',
    equipment: data.equipment || '',
    workContent: data.workContent || '',
    scopeItems: scope.length ? scope : [DOTS_SCOPE],
    timeText: data.timeText || 'theo lịch cắt điện được duyệt.',
    risks: (data.risks || []).map(r => ({ hazard: r.hazard, measures: r.measures, performer: r.performer })),
    workUnitSigner: workUnitReps[0]?.name || '',
    qlvhSigner: qlvhReps[0]?.name || '',
    // "Tổ TNLĐ" nếu có tên viết tắt, không thì tên đầy đủ của tổ
    teamShortLabel: header.teamShort ? `Tổ ${header.teamShort}` : (header.teamName || ''),
    diagramDateText: formatShortDate(data.diagramDate || data.surveyTime)
  };
}

module.exports = { toSurveyView, formatSurveyTime, formatShortDate };
