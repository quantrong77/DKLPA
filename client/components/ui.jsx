import React from 'react';
import { AlertTriangle, RefreshCw, SearchX, Clock } from 'lucide-react';

// Lớp Tailwind theo hệ thiết kế của ChatLan (ba mức nút, ô nhập, thẻ).
export const btnPrimary = 'px-3.5 py-2 bg-chatlan-600 hover:bg-chatlan-700 disabled:opacity-60 text-white font-bold rounded-lg shadow-sm text-xs inline-flex items-center gap-1.5 transition';
export const btnSecondary = 'px-3 py-2 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 hover:border-slate-300 dark:border-slate-700 font-semibold rounded-lg text-xs inline-flex items-center gap-1.5 transition disabled:opacity-60';
export const btnGhost = 'p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition';
export const inputCls = 'w-full px-2.5 py-1.5 text-sm bg-white dark:bg-slate-900 border rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-chatlan-500/40 focus:border-chatlan-500';
export const inputBorder = (invalid) => (invalid ? 'border-red-400 dark:border-red-500' : 'border-slate-200 dark:border-slate-700');
export const cardCls = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm';

export function Field({ label, htmlFor, error, hint, required, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
          {label}{required && <span className="text-red-500"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

/** Danh sách không tải được (mất mạng, máy chủ lỗi): báo rõ và cho thử lại, không hiện "Chưa có…". */
export function ListError({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 text-center p-6 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30">
      <AlertTriangle className="w-6 h-6 text-red-500" aria-hidden="true" />
      <p className="text-sm font-semibold text-red-800 dark:text-red-200">Không tải được danh sách</p>
      {message && <p className="text-xs text-red-700 dark:text-red-300 max-w-md">{message}</p>}
      <button type="button" className={btnSecondary} onClick={onRetry}><RefreshCw className="w-4 h-4" aria-hidden="true" /> Thử lại</button>
    </div>
  );
}

/** Tìm không ra: khác với danh sách trống. */
export function NoMatch({ search, onClear }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
      <SearchX className="w-6 h-6 text-slate-400" aria-hidden="true" />
      <p className="text-sm text-slate-600 dark:text-slate-300">Không tìm thấy kết quả khớp “{search.trim()}”.</p>
      <button type="button" className={btnSecondary} onClick={onClear}>Xóa từ khóa tìm</button>
    </div>
  );
}

/** Nhãn "Chưa lưu" ở đầu biểu mẫu; Ctrl+S để lưu. */
export function UnsavedBadge({ show }) {
  if (!show) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold align-middle bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
      title="Có thay đổi chưa lưu — bấm Lưu hoặc Ctrl+S">
      <span aria-hidden="true">●</span> Chưa lưu
    </span>
  );
}

export function Section({ title, subtitle, actions, children }) {
  return (
    <section className={cardCls}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** Nhãn nguồn dữ liệu: lấy từ lịch cắt điện hay tự ghi. */
export function SourceBadge({ source, onReset }) {
  if (source !== 'outage') return <span className="text-xs text-slate-500 dark:text-slate-400">Tự ghi</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
      Theo lịch cắt điện
      {onReset && (
        <button type="button" onClick={onReset} className="underline hover:no-underline">khôi phục</button>
      )}
    </span>
  );
}

export function TabButton({ active, onClick, icon: Icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition inline-flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
        active
          ? 'bg-chatlan-50 text-chatlan-600 dark:bg-chatlan-900/60 dark:text-chatlan-400 border border-chatlan-200 dark:border-chatlan-900'
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      {Icon && <Icon className="w-4 h-4" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

// khung thời gian trên dòng lịch / công việc: tô theo màu biến động (hoãn đỏ, dời lịch xanh, sửa nội dung tím, phát sinh vàng)
const TIME_TONES = {
  POSTPONED: 'bg-red-100 border-red-400 text-red-900 dark:bg-red-900/50 dark:border-red-600 dark:text-red-100',
  MOVED: 'bg-sky-100 border-sky-400 text-sky-900 dark:bg-sky-900/50 dark:border-sky-600 dark:text-sky-100',
  EDITED: 'bg-violet-100 border-violet-400 text-violet-900 dark:bg-violet-900/50 dark:border-violet-600 dark:text-violet-100',
  NEW: 'bg-yellow-100 border-yellow-400 text-yellow-900 dark:bg-yellow-900/40 dark:border-yellow-600 dark:text-yellow-100'
};
const TIME_DEFAULT = 'bg-chatlan-50 border-chatlan-300 text-chatlan-700 dark:bg-chatlan-900/40 dark:border-chatlan-800 dark:text-chatlan-200';

/** Thời gian của một dòng (bắt đầu → kết thúc) trong khung có viền; kind: loại biến động của dòng lịch (tô màu tương ứng). */
export function TimeBox({ kind, title, children }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-bold tabular-nums ${TIME_TONES[kind] || TIME_DEFAULT}`}>
      <Clock className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />{children}
    </span>
  );
}

export function formatDateTime(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || '');
  return m ? `${m[4]}:${m[5]} ${m[3]}/${m[2]}/${m[1]}` : '';
}
