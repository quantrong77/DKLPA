import React, { useEffect, useState } from 'react';
import { Loader2, CalendarClock, AlertTriangle, Settings, X } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { formatDateTime, btnGhost, btnSecondary } from './ui.jsx';
import OutageSettingsPanel from './OutageSettingsPanel.jsx';
import { CHANGE_TONES } from './OutageAlert.jsx';

const KIND_LABEL = { NEW: 'Phát sinh', POSTPONED: 'Hoãn', MOVED: 'Dời lịch', EDITED: 'Sửa nội dung', RESTORED: 'Có lại' };
const RESTORED_TAG = 'bg-emerald-600 text-white';

/** Lịch sử thay đổi của một dòng lịch (mới nhất trước). */
export function OutageHistory({ outageId }) {
  const { api } = useDkct();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    api.get(`/outages/${outageId}/history`)
      .then(r => { if (alive) setItems(r.items); })
      .catch(e => { if (alive) { setError(e.message); setItems([]); } });
    return () => { alive = false; };
  }, [api, outageId]);

  if (items === null) return <Loader2 className="w-4 h-4 animate-spin text-chatlan-600" aria-label="Đang tải lịch sử" />;
  if (error) return <p className="text-xs text-red-700 dark:text-red-400">{error}</p>;
  if (!items.length) return <p className="text-xs text-slate-500">Chưa có thay đổi nào được ghi nhận.</p>;
  return (
    <ol className="space-y-1 border-l-2 border-slate-200 dark:border-slate-700 pl-3" aria-label="Lịch sử thay đổi">
      {items.map(h => (
        <li key={h.id} className="text-xs text-slate-700 dark:text-slate-200">
          <span className="text-slate-500 mr-1.5">{formatDateTime(h.changedAt)}</span>
          <span className={`inline-block px-1.5 py-px rounded text-[10px] font-bold mr-1.5 ${h.kind === 'RESTORED' ? RESTORED_TAG : CHANGE_TONES[h.kind]?.tag || ''}`}>{KIND_LABEL[h.kind] || h.kind}</span>
          {h.note && h.kind !== 'RESTORED' && <span>{h.note}</span>}
          {h.source && <span className="block text-[11px] text-slate-500 pl-0.5">Nguồn: {h.source}</span>}
        </li>
      ))}
    </ol>
  );
}

const SUMMARY_PARTS = [['postponed', 'hoãn'], ['moved', 'dời lịch'], ['edited', 'sửa nội dung'], ['added', 'phát sinh'], ['restored', 'có lại']];

/** Hộp cấu hình tải lịch (admin) mở ngay từ tab Lịch cắt điện. */
function OutageSettingsDialog({ onClose }) {
  const { ModalOverlay } = useDkct();
  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-4 bg-slate-900/40 overflow-y-auto">
      <div role="dialog" aria-modal="true" aria-labelledby="dkct-outage-settings-title"
        className="w-full max-w-2xl bg-slate-50 dark:bg-slate-950 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Settings className="w-5 h-5 text-chatlan-600" aria-hidden="true" />
          <h2 id="dkct-outage-settings-title" className="flex-1 text-base font-bold text-slate-900 dark:text-white">Cài đặt tải lịch cắt điện</h2>
          <button type="button" className={btnGhost} onClick={onClose} aria-label="Đóng"><X className="w-5 h-5" /></button>
        </header>
        <div className="p-4"><OutageSettingsPanel /></div>
      </div>
    </ModalOverlay>
  );
}

/**
 * "Tự tải lúc 07:00, 15:00 hằng ngày · Lần gần nhất: …" cho mọi người xem (khi đã bật tự tải hoặc đã có lần tải).
 * Admin luôn thấy dòng này kèm nút "Cài đặt tải lịch" (tài khoản trang lịch, giờ tự tải).
 */
export function AutoFetchStatus({ refresh, canConfigure }) {
  const { api } = useDkct();
  const [src, setSrc] = useState(null);
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => { api.get('/outages/source').then(setSrc).catch(() => setSrc(null)); }, [api, refresh, reload]);
  if (!src || (!canConfigure && !src.auto && !src.runs?.length)) return null;
  const last = src.runs?.[0];
  let lastText = null;
  if (last) {
    const s = last.summary;
    const changes = s ? SUMMARY_PARTS.filter(([k]) => s[k]).map(([k, label]) => `${s[k]} ${label}`).join(', ') : '';
    lastText = last.ok === false
      ? <span className="text-red-700 dark:text-red-400 inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {formatDateTime(last.startedAt)} lỗi: {last.error}</span>
      : last.ok ? `${formatDateTime(last.startedAt)}${last.mode === 'AUTO' ? ' (tự động)' : ''} — ${last.rowsCount ?? 0} dòng${s?.compared ? `; ${changes || 'không có thay đổi'}` : ''}${s?.notified ? `; đã báo ${s.notified} người` : ''}`
        : `${formatDateTime(last.startedAt)} — đang tải…`;
  }
  return (
    <div className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-x-2 gap-y-1" role="status">
      <CalendarClock className="w-3.5 h-3.5 text-chatlan-600" aria-hidden="true" />
      {src.auto
        ? <span>Tự tải lịch lúc <b>{src.auto.times.join(', ')}</b> hằng ngày ({src.auto.days} ngày tới), báo thay đổi cho người liên quan.</span>
        : <span>Chưa bật tự tải theo giờ{canConfigure ? (src.configured ? ' (đã có tài khoản trang lịch, chưa đặt giờ tải)' : ' (chưa có tài khoản trang lịch)') : ''}.</span>}
      {lastText && <span>Lần tải gần nhất: {lastText}</span>}
      {canConfigure && (
        <button type="button" className={`${btnSecondary} !py-1`} onClick={() => setOpen(true)}>
          <Settings className="w-3.5 h-3.5" /> Cài đặt tải lịch
        </button>
      )}
      {open && <OutageSettingsDialog onClose={() => { setOpen(false); setReload(n => n + 1); }} />}
    </div>
  );
}
