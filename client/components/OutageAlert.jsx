import React from 'react';
import { CalendarX2, CalendarClock, FilePenLine } from 'lucide-react';
import { outageAlert } from '../lib/outageChange.js';

const ICONS = { POSTPONED: CalendarX2, MOVED: CalendarClock, EDITED: FilePenLine };
// hoãn đỏ, dời lịch xanh dương, sửa nội dung tím (phát sinh vàng chỉ có ở tab Lịch cắt điện)
export const CHANGE_TONES = {
  POSTPONED: { tag: 'bg-red-600 text-white', box: 'bg-red-50 border-red-300 text-red-900 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200' },
  MOVED: { tag: 'bg-sky-600 text-white', box: 'bg-sky-50 border-sky-300 text-sky-900 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-200' },
  EDITED: { tag: 'bg-violet-600 text-white', box: 'bg-violet-50 border-violet-300 text-violet-900 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-200' },
  NEW: { tag: 'bg-yellow-400 text-yellow-950', box: 'bg-yellow-50 border-yellow-300 text-yellow-900 dark:bg-yellow-950/30 dark:border-yellow-800 dark:text-yellow-200' }
};

/** Nhãn nhỏ trên dòng danh sách hồ sơ: "Lịch: Hoãn / Dời lịch / Sửa nội dung". */
export function OutageChangeTag({ change }) {
  const a = change && outageAlert(change.kind, change.note);
  if (!a) return null;
  const Icon = ICONS[a.kind];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold ${CHANGE_TONES[a.kind].tag}`}
      title={[a.text, a.note].filter(Boolean).join('\n')} role="note" aria-label={`Lịch cắt điện: ${a.label}. ${a.note}`}>
      <Icon className="w-3 h-3" aria-hidden="true" /> Lịch: {a.label}
    </span>
  );
}

/** Dải cảnh báo trên hồ sơ có dòng lịch đã hoãn / dời / sửa. */
export function OutageAlertBanner({ kind, note, className = '', children }) {
  const a = outageAlert(kind, note);
  if (!a) return null;
  const Icon = ICONS[a.kind];
  return (
    <div className={`flex items-start gap-2 px-3 py-1.5 rounded-lg border text-xs ${CHANGE_TONES[a.kind].box} ${className}`} role="alert">
      <Icon className="w-4 h-4 flex-shrink-0 mt-px" aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <b className="font-semibold">{a.text}</b>
        {a.note && <span className="block">{a.note}</span>}
        {children}
      </span>
    </div>
  );
}
