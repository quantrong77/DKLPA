import React, { useEffect, useState } from 'react';
import { Zap, Search, Link2, Unlink, Loader2, ChevronDown } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { btnSecondary, btnGhost, inputCls, inputBorder, formatDateTime } from './ui.jsx';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const range = (a, b) => [formatDateTime(a), formatDateTime(b)].filter(Boolean).join(' → ');

function Detail({ label, children, wide }) {
  if (!children) return null;
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-line">{children}</dd>
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
            <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
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
 * Khung "Lịch cắt điện liên quan" trong biên bản KSHT / phương án: hiện chi tiết dòng lịch đã gắn (outageId),
 * hoặc cho chọn một dòng lịch khi hồ sơ lập riêng (không từ tab Lịch cắt điện).
 */
export default function LinkedOutage({ outageId, onChange, readOnly }) {
  const { api } = useDkct();
  const [outage, setOutage] = useState(null);
  const [state, setState] = useState(outageId ? 'loading' : 'none'); // loading | shown | missing | none
  const [picking, setPicking] = useState(false);
  const [open, setOpen] = useState(true);

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

  const pick = (o) => { setOutage(o); setPicking(false); setOpen(true); onChange(o.id); };

  return (
    <section className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3" aria-label="Lịch cắt điện liên quan">
      <div className="flex items-center gap-2">
        <button type="button" className="flex-1 flex items-center gap-2 text-left" aria-expanded={open} onClick={() => setOpen(v => !v)}>
          <Zap className="w-4 h-4 text-amber-600 flex-shrink-0" aria-hidden="true" />
          <span className="text-sm font-bold text-slate-900 dark:text-white">Lịch cắt điện liên quan</span>
          {state === 'shown' && !open && <span className="text-xs text-slate-600 dark:text-slate-300 truncate">{range(outage.regStart, outage.regEnd)} · {outage.location}</span>}
          <ChevronDown className={`w-4 h-4 text-slate-500 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {!readOnly && state !== 'none' && !picking && (
          <>
            <button type="button" className={btnSecondary} onClick={() => { setPicking(true); setOpen(true); }}><Link2 className="w-4 h-4" /> Chọn lịch khác</button>
            <button type="button" className={btnGhost} aria-label="Bỏ gắn lịch cắt điện" title="Bỏ gắn lịch cắt điện" onClick={() => onChange(null)}><Unlink className="w-4 h-4" /></button>
          </>
        )}
      </div>

      {open && (
        <div className="mt-2">
          {picking ? <OutagePicker onPick={pick} onCancel={() => setPicking(false)} />
            : state === 'loading' ? <Loader2 className="w-4 h-4 animate-spin text-chatlan-600" aria-label="Đang tải" />
              : state === 'missing' ? <p className="text-xs text-amber-800 dark:text-amber-300">Dòng lịch đã gắn không còn trong lịch cắt điện (có thể đã bị xóa).</p>
                : state === 'none' ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs text-slate-600 dark:text-slate-300 flex-1">Chưa gắn với dòng lịch nào. Gắn để xem thời gian, phạm vi cắt điện và để tab Lịch cắt điện tính tiến độ đúng.</p>
                    {!readOnly && <button type="button" className={btnSecondary} onClick={() => setPicking(true)}><Link2 className="w-4 h-4" /> Chọn từ lịch cắt điện</button>}
                  </div>
                ) : (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                    <Detail label="Thời gian đăng ký">{range(outage.regStart, outage.regEnd)}</Detail>
                    <Detail label="Thời gian thực tế">{range(outage.actualStart, outage.actualEnd)}</Detail>
                    <Detail label="Địa điểm">{outage.location}</Detail>
                    <Detail label="Tình trạng">{outage.status}</Detail>
                    <Detail label="Nội dung công tác" wide>{outage.content}</Detail>
                    <Detail label="Phạm vi / điều kiện cắt điện" wide>{outage.scope}</Detail>
                    <Detail label="Đơn vị đăng ký">{outage.registrationUnit}</Detail>
                    <Detail label="Đơn vị công tác">{outage.workUnit}</Detail>
                  </dl>
                )}
        </div>
      )}
    </section>
  );
}
