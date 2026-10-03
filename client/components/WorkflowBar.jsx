import React from 'react';
import { Zap, ClipboardList, FileStack, FileText, BadgeCheck, Check, ChevronRight, Route, X, CircleDot } from 'lucide-react';
import { workflowSteps, doneCount, selectionTitle, stepOfType, WORKFLOW_STEPS } from '../lib/workflow.js';
import { chainAlert } from '../lib/outageChange.js';
import { OutageAlertBanner } from './OutageAlert.jsx';

const ICONS = { outage: Zap, survey: ClipboardList, plan: FileStack, registration: FileText, confirmation: BadgeCheck };

const CIRCLE = {
  idle: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  todo: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
  next: 'bg-amber-100 text-amber-700 ring-2 ring-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:ring-amber-700',
  done: 'bg-emerald-500 text-white',
  selected: 'bg-chatlan-600 text-white ring-2 ring-chatlan-200 dark:ring-chatlan-800'
};

function statusText(step) {
  const more = step.docs.length > 2 ? ` +${step.docs.length - 2}` : '';
  const names = step.docs.slice(0, 2).map(d => d.label).filter(Boolean).join(', ');
  switch (step.state) {
    case 'selected': return names ? `Đang chọn · ${names}${more}` : 'Đang chọn';
    case 'done': return `${names || `${step.docs.length} hồ sơ`}${more}`;
    case 'next': return 'Tiếp theo';
    case 'todo': return 'Chưa có';
    default: return null;
  }
}

/**
 * Thanh luồng chuẩn bị công tác: Lịch cắt điện → Khảo sát → Phương án → Giấy ĐKCT → Giấy xác nhận.
 * Bấm một bước để mở danh sách của bước đó. Khi đã chọn một hồ sơ, mỗi bước hiện hồ sơ cùng luồng
 * (đã có / bước tiếp theo / chưa có).
 */
export default function WorkflowBar({ tab, onTab, chain, selection, onClearSelection, extraTabs }) {
  const steps = workflowSteps(chain, selection);
  const selectedRow = selection && chain ? (chain[stepOfType(selection.type)?.list] || []).find(r => r.id === selection.id) : null;
  const done = doneCount(steps);
  const alert = selection && chain ? chainAlert(chain.outages) : null;
  return (
    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
        <nav className="flex-1 min-w-0 overflow-x-auto -mx-1 px-1" aria-label="Luồng chuẩn bị công tác">
          <ol className="flex items-stretch min-w-max">
            {steps.map((s, i) => {
              const Icon = ICONS[s.type];
              const active = tab === s.tab;
              const sub = statusText(s);
              return (
                <li key={s.type} className="flex items-center">
                  {i > 0 && (
                    <ChevronRight aria-hidden="true"
                      className={`w-3 h-3 sm:w-4 sm:h-4 sm:mx-0.5 flex-shrink-0 ${steps[i - 1].docs.length && (s.docs.length || s.state === 'selected') ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'}`} />
                  )}
                  <button type="button" onClick={() => onTab(s.tab)} aria-current={active ? 'page' : undefined}
                    aria-label={`Bước ${i + 1}: ${s.label}${sub ? ` (${sub})` : ''}`}
                    title={s.docs.length ? s.docs.map(d => d.label).join(', ') : undefined}
                    className={`flex items-center gap-1 sm:gap-2 p-1 sm:pl-1.5 sm:pr-3 sm:py-1.5 rounded-xl text-left transition-colors ${active
                      ? 'bg-chatlan-50 dark:bg-chatlan-900/40 shadow-[inset_0_-2px_0_0] shadow-chatlan-600'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                    <span className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center flex-shrink-0 ${CIRCLE[s.state]}`}>
                      {s.state === 'done' ? <Check className="w-4 h-4" aria-hidden="true" /> : <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
                    </span>
                    <span className="leading-tight">
                      <span className={`block text-sm font-semibold ${active ? 'text-chatlan-700 dark:text-chatlan-300' : 'text-slate-800 dark:text-slate-100'}`}>
                        <span className="hidden sm:inline text-slate-400 dark:text-slate-500 font-normal mr-1">{i + 1}.</span>
                        <span className="hidden sm:inline">{s.label}</span><span className="sm:hidden text-xs">{s.short}</span>
                      </span>
                      {sub && (
                        <span className={`hidden sm:block text-[11px] max-w-[11rem] truncate ${s.state === 'done' ? 'text-emerald-700 dark:text-emerald-400'
                          : s.state === 'next' ? 'text-amber-700 dark:text-amber-400 font-semibold'
                            : s.state === 'selected' ? 'text-chatlan-700 dark:text-chatlan-300' : 'text-slate-400 dark:text-slate-500'}`}>{sub}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        {extraTabs && <div className="flex items-center gap-1 sm:pl-2 sm:border-l border-slate-200 dark:border-slate-700 flex-shrink-0">{extraTabs}</div>}
      </div>
      {selection ? (
        <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-chatlan-50 dark:bg-chatlan-900/40 border border-chatlan-100 dark:border-chatlan-900 text-xs" role="status">
          <Route className="w-3.5 h-3.5 text-chatlan-600 flex-shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0 truncate text-slate-700 dark:text-slate-200">
            Đang theo dõi: <b className="font-semibold text-slate-900 dark:text-white">{selectedRow ? selectionTitle(selection.type, selectedRow) : '…'}</b>
          </span>
          {chain && <span className="flex-shrink-0 font-semibold text-slate-600 dark:text-slate-300">{done}/{WORKFLOW_STEPS.length} bước</span>}
          <button type="button" onClick={onClearSelection} className="p-0.5 rounded hover:bg-chatlan-100 dark:hover:bg-chatlan-900 flex-shrink-0"
            aria-label="Bỏ theo dõi" title="Bỏ theo dõi">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : null}
      {alert && (
        <OutageAlertBanner kind={alert.kind} note={alert.note} className="mt-1.5">
          <button type="button" className="underline font-semibold" onClick={() => onTab(WORKFLOW_STEPS[0].tab)}>Xem lịch cắt điện</button>
        </OutageAlertBanner>
      )}
      {selection ? null : (
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
          Bấm <Route className="w-3 h-3" aria-label="biểu tượng luồng" /> ở một hồ sơ (hoặc mở hồ sơ) để xem hồ sơ đó đã qua những bước nào.
        </p>
      )}
    </div>
  );
}

/** Nút chọn hồ sơ để theo dõi luồng, đặt đầu mỗi dòng danh sách. */
export function TrackButton({ active, linked, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      aria-label={active ? 'Bỏ theo dõi luồng hồ sơ này' : 'Theo dõi luồng công việc của hồ sơ này'}
      title={active ? 'Đang theo dõi — bấm để bỏ' : linked ? 'Cùng luồng với hồ sơ đang theo dõi' : 'Theo dõi luồng công việc'}
      className={`p-1.5 rounded-full flex-shrink-0 transition-colors ${active ? 'bg-chatlan-600 text-white'
        : linked ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
          : 'text-slate-400 hover:text-chatlan-600 hover:bg-chatlan-50 dark:hover:bg-chatlan-900/40'}`}>
      {active ? <CircleDot className="w-4 h-4" /> : <Route className="w-4 h-4" />}
    </button>
  );
}

/** Khung một dòng danh sách: nổi bật hồ sơ đang theo dõi và hồ sơ cùng luồng. */
export function rowFrame(id, selectedId, linked) {
  if (id === selectedId) return 'bg-chatlan-50/70 dark:bg-chatlan-900/40 border border-chatlan-500 ring-1 ring-chatlan-500';
  if (linked?.has(id)) return 'bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-800';
  return 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800';
}
