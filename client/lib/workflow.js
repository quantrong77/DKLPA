// Luồng chuẩn bị công tác (thuần, không phụ thuộc React).

export const APP_NAME = 'Chuẩn bị công tác';

/**
 * 5 bước theo trình tự công việc; tab: tab danh sách tương ứng, list: khóa danh sách trong kết quả /workflow.
 * Bước 1 là gốc của luồng: dòng lịch cắt điện, hoặc công việc không có lịch cắt điện (types/lists phụ).
 */
export const WORKFLOW_STEPS = [
  { type: 'outage', types: ['outage', 'work'], tab: 'outages', list: 'outages', lists: ['outages', 'works'], label: 'Lịch / Công việc', short: 'Lịch' },
  { type: 'survey', tab: 'surveys', list: 'surveys', label: 'Khảo sát', short: 'KSHT' },
  { type: 'plan', tab: 'plans', list: 'plans', label: 'Phương án', short: 'PA' },
  { type: 'registration', tab: 'registrations', list: 'registrations', label: 'Giấy ĐKCT', short: 'ĐKCT' },
  { type: 'confirmation', tab: 'confirmations', list: 'confirmations', label: 'Giấy xác nhận', short: 'GXN' }
];
export const stepOfType = (type) => WORKFLOW_STEPS.find(s => s.type === type || s.types?.includes(type)) || null;
/** Tên loại hồ sơ (bước 1 có hai loại). */
const TYPE_LABEL = { outage: 'Lịch cắt điện', work: 'Công việc' };
export const typeLabel = (type) => TYPE_LABEL[type] || stepOfType(type)?.label || '';
/** Khóa danh sách của một loại hồ sơ trong kết quả /workflow. */
export const listOfType = (type) => (type === 'work' ? 'works' : stepOfType(type)?.list || null);
export const stepOfTab = (tab) => WORKFLOW_STEPS.find(s => s.tab === tab) || null;

const day = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : '';
};
const clip = (v, n = 60) => {
  const s = String(v || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

/** Nhãn ngắn của một hồ sơ để hiện trên thanh luồng (số văn bản nếu có, không thì ngày). */
export function docLabel(type, row) {
  if (!row) return '';
  if (row.docNumber) return String(row.docNumber);
  if (type === 'outage') return day(row.regStart) || 'Lịch';
  if (type === 'survey') return day(row.surveyTime) ? `BB ${day(row.surveyTime)}` : 'Biên bản';
  if (type === 'work') return day(row.startTime) ? `CV ${day(row.startTime)}` : 'Công việc';
  return '';
}

/** Mô tả hồ sơ đang chọn: "Phương án 12/PA-TNLĐ · Thí nghiệm định kỳ …". */
export function selectionTitle(type, row) {
  const step = stepOfType(type);
  if (!step || !row) return '';
  const what = row.workTitle || row.workContent || row.content || [row.stationName, row.bays].filter(Boolean).join(' · ') || row.location || '';
  const label = type === 'work' ? (day(row.startTime) || '') : docLabel(type, row);
  return [`${typeLabel(type)} ${label}`.trim(), clip(what)].filter(Boolean).join(' · ');
}

/**
 * Trạng thái từng bước theo hồ sơ đang chọn.
 * state: 'selected' (bước của hồ sơ đang chọn) | 'done' (đã có hồ sơ) | 'next' (bước kế tiếp nên làm) | 'todo' | 'idle' (chưa chọn gì).
 */
export function workflowSteps(chain, selection) {
  if (!chain || !selection) return WORKFLOW_STEPS.map(s => ({ ...s, docs: [], state: 'idle' }));
  const selected = stepOfType(selection.type);
  const steps = WORKFLOW_STEPS.map(s => {
    const docs = (s.lists || [s.list]).flatMap(list => {
      const type = list === 'works' ? 'work' : s.type;
      return (chain[list] || []).map(row => ({ id: row.id, label: docLabel(type, row), row, type }));
    });
    const state = s === selected ? 'selected' : docs.length ? 'done' : 'todo';
    return { ...s, docs, state };
  });
  // bước kế tiếp: bước chưa có hồ sơ đầu tiên sau bước cuối cùng đã có
  let last = -1;
  steps.forEach((s, i) => { if (s.docs.length || s.state === 'selected') last = i; });
  if (last + 1 < steps.length && steps[last + 1].state === 'todo') steps[last + 1].state = 'next';
  return steps;
}

/** Id các hồ sơ cùng luồng (để tô trong danh sách). */
export function linkedIds(chain) {
  const ids = new Set();
  for (const s of WORKFLOW_STEPS) for (const list of s.lists || [s.list]) for (const row of chain?.[list] || []) ids.add(row.id);
  return ids;
}

/** Tiến độ: số bước đã có hồ sơ / 5. */
export const doneCount = (steps) => steps.filter(s => s.docs.length > 0).length;
