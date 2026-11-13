import React, { useEffect, useState } from 'react';
import { Search, Link2, Unlink, Loader2, ChevronDown } from 'lucide-react';
import { IconIsolatorOpen } from './powerIcons.jsx';
import { useDkct } from '../context.jsx';
import { btnSecondary, inputCls, inputBorder, formatDateTime } from './ui.jsx';
import { OutageAlertBanner } from './OutageAlert.jsx';
import { OutageHistory } from './OutageHistory.jsx';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const range = (a, b) => [formatDateTime(a), formatDateTime(b)].filter(Boolean).join(' → ');

function Detail({ label, children, wide }) {
  if (!children) return null;
  return (
    <div className={wide ? 'sm:col-span-3' : ''}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-xs text-slate-800 dark:text-slate-100 whitespace-pre-line">{children}</dd>
    </div>
  );
}

/** Chọn dòng lịch để gắn: lọc theo ngày và từ khóa như tab Lịch cắt điện. */
function OutagePicker({ onPick, onCancel }) {
  const { api, notify } = useDkct();
  const [from, setFrom] = useState(todayIso());
  const [search, setSearch] = useState('');
  const [items, setItems] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/outages?${new URLSearchParams({ from, search })}`)
        .then(r => setItems(r.items.slice(0, 50)))
        .catch(err => { notify(err.message, 'error'); setItems([]); });
    }, 250);
    return () => clearTimeout(t);
  }, [api, notify, from, search]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Từ ngày
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${inputCls} ${inputBorder()} block mt-1`} />
        </label>
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" aria-label="Tìm lịch cắt điện" placeholder="Tìm trạm, thiết bị, đơn vị…" value={search}
            onChange={e => setSearch(e.target.value)} className={`${inputCls} ${inputBorder()} pl-8`} />
        </div>
        <button type="button" className={btnSecondary} onClick={onCancel}>Hủy</button>
      </div>
      {items === null ? <Loader2 className="w-4 h-4 animate-spin text-chatlan-600" aria-label="Đang tải" />
        : items.length === 0 ? <p className="text-xs text-slate-500">Không có dòng lịch nào khớp. Đổi ngày hoặc từ khóa.</p>
          : (
            <ul className="max-h-48 overflow-y-auto bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
              {items.map(o => (
                <li key={o.id}>
                  <button type="button" onClick={() => onPick(o)} className="w-full text-left px-3 py-2 hover:bg-chatlan-50 dark:hover:bg-chatlan-900/30">
                    <span className="block text-xs font-semibold text-chatlan-700 dark:text-chatlan-300">{range(o.regStart, o.regEnd)} · {o.location}</span>
                    <span className="block text-sm text-slate-800 dark:text-slate-100 line-clamp-2 whitespace-pre-line">{o.content}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
    </div>
  );
}

/**
 * Dải "Lịch cắt điện liên quan" của biên bản KSHT / phương án: một dòng tóm tắt, đặt ngoài vùng cuộn nên luôn thấy;
 * bấm để xem đủ chi tiết (chiều cao giới hạn). Hồ sơ lập riêng (không từ tab Lịch cắt điện) thì chọn dòng lịch để gắn.
 */
export default function LinkedOutage({ outageId, onChange, onOutage, readOnly }) {
  const { api } = useDkct();
  const [outage, setOutage] = useState(null);
  const [state, setState] = useState(outageId ? 'loading' : 'none'); // loading | shown | missing | none
  const [picking, setPicking] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!outageId) { setOutage(null); setState('none'); return undefined; }
    if (outage?.id === outageId) { setState('shown'); return undefined; }
    let alive = true;
    setState('loading');
    api.get(`/outages/${outageId}`)
      .then(r => { if (alive) { setOutage(r.outage); setState('shown'); } })
      .catch(() => { if (alive) setState('missing'); });
    return () => { alive = false; };
  }, [api, outageId]); // eslint-disable-line react-hooks/exhaustive-deps

  // báo dòng lịch đang gắn (đủ nội dung) cho biểu mẫu tự điền; không gắn/không còn -> null
  useEffect(() => { onOutage?.(state === 'shown' ? outage : null); }, [state, outage]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (o) => { setOutage(o); setPicking(false); onChange(o.id, o); };
  const shown = state === 'shown' && outage;
  const iconBtn = 'p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 flex-shrink-0';

  let summary;
  if (state === 'loading') summary = <Loader2 className="w-3.5 h-3.5 animate-spin text-chatlan-600" aria-label="Đang tải lịch cắt điện" />;
  else if (state === 'missing') summary = <span className="text-amber-800 dark:text-amber-300">Dòng lịch đã gắn không còn (có thể đã bị xóa)</span>;
  else if (state === 'none') summary = <span className="text-slate-500">Chưa gắn lịch cắt điện</span>;
  else {
    summary = (
      <span className="truncate" title={`${range(outage.regStart, outage.regEnd)} · ${outage.location}\n${outage.content}`}>
        <b className="font-semibold text-slate-900 dark:text-white">{range(outage.regStart, outage.regEnd)}</b>
        {outage.location ? ` · ${outage.location}` : ''}
        <span className="text-slate-600 dark:text-slate-300"> · {String(outage.content || '').replace(/\s+/g, ' ')}</span>
      </span>
    );
  }

  return (
    <div className="border-b border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-1 text-xs" aria-label="Lịch cắt điện liên quan">
      <div className="flex items-center gap-1.5 min-h-[1.75rem]">
        <IconIsolatorOpen className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" aria-hidden="true" />
        {shown ? (
          <button type="button" className="flex-1 min-w-0 flex items-center gap-1 text-left" aria-expanded={open} onClick={() => setOpen(v => !v)}
            title={open ? 'Thu gọn' : 'Xem chi tiết lịch cắt điện'}>
            {summary}
            <ChevronDown className={`w-3.5 h-3.5 text-slate-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        ) : <span className="flex-1 min-w-0 flex items-center">{summary}</span>}
        {!readOnly && !picking && (
          <>
            <button type="button" className={iconBtn} aria-label={state === 'none' ? 'Chọn từ lịch cắt điện' : 'Chọn lịch khác'}
              title={state === 'none' ? 'Chọn từ lịch cắt điện' : 'Chọn lịch khác'} onClick={() => { setPicking(true); setOpen(false); }}>
              <Link2 className="w-3.5 h-3.5" />
            </button>
            {state !== 'none' && (
              <button type="button" className={iconBtn} aria-label="Bỏ gắn lịch cắt điện" title="Bỏ gắn lịch cắt điện" onClick={() => { setOpen(false); onChange(null); }}>
                <Unlink className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>

      {shown && !picking && <OutageAlertBanner kind={outage.changeKind} note={outage.changeNote} className="mb-1" />}
      {picking && <div className="pb-2 pt-1"><OutagePicker onPick={pick} onCancel={() => setPicking(false)} /></div>}
      {open && shown && !picking && (
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 pb-2 pt-1 max-h-40 overflow-y-auto">
          <Detail label="Thời gian trước khi dời">{range(outage.prevStart, outage.prevEnd)}</Detail>
          <Detail label="Thời gian thực tế">{range(outage.actualStart, outage.actualEnd)}</Detail>
          <Detail label="Tình trạng">{outage.status}</Detail>
          <Detail label="Đơn vị đăng ký / công tác">{[outage.registrationUnit, outage.workUnit].filter(Boolean).join(' / ')}</Detail>
          <Detail label="Nội dung công tác" wide>{outage.content}</Detail>
          <Detail label="Phạm vi / điều kiện cắt điện" wide>{outage.scope}</Detail>
          <div className="sm:col-span-3">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Lịch sử thay đổi</dt>
            <dd className="pt-0.5"><OutageHistory outageId={outage.id} /></dd>
          </div>
        </dl>
      )}
    </div>
  );
}
