import React, { useCallback, useEffect, useState } from 'react';
import { FileStack, Search, FileDown, Trash2, Eye, Pencil, Hash } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { btnGhost, btnSecondary, inputCls, inputBorder, formatDateTime } from './ui.jsx';
import { TrackButton, rowFrame } from './WorkflowBar.jsx';

/** Danh sách phương án thi công, biện pháp an toàn của tổ (admin thấy tất cả). */
export default function PlanList({ selectedId, linked, onTrack, reloadKey, onOpen, canCreate }) {
  const { api, notify, confirmAction, downloadAuthenticatedFile, EmptyState } = useDkct();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [numbering, setNumbering] = useState(null);
  const [startDraft, setStartDraft] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, num] = await Promise.all([api.get(`/plans?${new URLSearchParams({ search, year })}`), api.get('/plan-numbering')]);
      setItems(list.items);
      setNumbering(num.numbering);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [api, notify, search, year]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load, reloadKey]);

  const remove = async (item) => {
    if (!(await confirmAction({ title: `Xóa phương án số ${item.docNumber}?`, message: 'Số của phương án này sẽ để trống (không tự cấp lại).', danger: true }))) return;
    try {
      await api.del(`/plans/${item.id}`);
      notify('Đã xóa phương án.', 'success');
      load();
    } catch (err) { notify(err.message, 'error'); }
  };
  const setStart = async (e) => {
    e.preventDefault();
    try {
      setNumbering((await api.put('/plan-numbering', { startNumber: startDraft })).numbering);
      setStartDraft(null);
      notify('Đã đặt số khởi đầu phương án.', 'success');
    } catch (err) { notify(err.message, 'error'); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" aria-label="Tìm phương án" placeholder="Tìm theo số, công tác, trạm…" value={search}
            onChange={e => setSearch(e.target.value)} className={`${inputCls} ${inputBorder()} pl-8`} />
        </div>
        <select aria-label="Năm" value={year} onChange={e => setYear(e.target.value)} className={`${inputCls} ${inputBorder()} !w-28`}>
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
          <option value="">Mọi năm</option>
        </select>
        {numbering && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
            <Hash className="w-3.5 h-3.5" /> Số phương án tiếp theo: <b>{numbering.preview}</b>
            {canCreate && startDraft === null && (
              <button type="button" className="ml-1 underline" onClick={() => setStartDraft(String(numbering.nextNumber))}>đặt số khởi đầu</button>
            )}
          </span>
        )}
        {startDraft !== null && (
          <form onSubmit={setStart} className="flex items-center gap-2 w-full sm:w-auto">
            <label htmlFor="pa-start-no" className="text-xs text-slate-600 dark:text-slate-300">Số khởi đầu năm {numbering.year} (đã cấp đến {numbering.lastIssued}):</label>
            <input id="pa-start-no" type="number" min={numbering.lastIssued + 1} value={startDraft} autoFocus
              onChange={e => setStartDraft(e.target.value)} className={`${inputCls} ${inputBorder()} !w-24`} />
            <button type="submit" className={btnSecondary}>Lưu</button>
            <button type="button" className={btnGhost} onClick={() => setStartDraft(null)}>Hủy</button>
          </form>
        )}
      </div>

      {!loading && items.length === 0 ? (
        <EmptyState icon={FileStack} title="Chưa có phương án"
          description={canCreate ? 'Bấm "Lập phương án", hoặc lập từ lịch cắt điện / biên bản khảo sát.' : 'Phương án do trưởng/phó tổ lập sẽ hiện ở đây.'} />
      ) : (
        <ul className="space-y-2" aria-busy={loading}>
          {items.map(item => (
            <li key={item.id} className={`${rowFrame(item.id, selectedId, linked)} rounded-xl p-3 shadow-sm flex flex-wrap items-start gap-3`}>
              {onTrack && <TrackButton active={item.id === selectedId} linked={linked?.has(item.id)} onClick={() => onTrack(item)} />}
              <span className="font-mono font-bold text-sm px-2.5 py-0.5 rounded-lg bg-chatlan-50 dark:bg-chatlan-900/60 text-chatlan-700 dark:text-chatlan-300 border border-chatlan-200 dark:border-chatlan-900">
                {item.docNumber}
              </span>
              <button type="button" className="flex-1 min-w-[12rem] text-left" onClick={() => onOpen(item)}>
                <p className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2">{item.workTitle}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.stationName}{item.startTime ? ` · ${formatDateTime(item.startTime)}` : ''}</p>
              </button>
              <div className="flex items-center gap-1">
                {item.canEdit ? (
                  <button type="button" className={btnSecondary} onClick={() => onOpen(item)}><Pencil className="w-4 h-4 text-chatlan-600" /> Sửa</button>
                ) : (
                  <button type="button" className={btnGhost} aria-label="Xem" onClick={() => onOpen(item)}><Eye className="w-4 h-4" /></button>
                )}
                <button type="button" className={btnGhost} aria-label="Tải Word"
                  onClick={() => downloadAuthenticatedFile(`/api/dkct/plans/${item.id}/docx`, `PhuongAn_${String(item.docNumber).replace(/\//g, '-')}.docx`).catch(e => notify(e.message, 'error'))}>
                  <FileDown className="w-4 h-4" />
                </button>
                {item.canEdit && <button type="button" className={btnGhost} aria-label="Xóa" onClick={() => remove(item)}><Trash2 className="w-4 h-4" /></button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {loading && items.length === 0 && <p className="text-xs text-slate-500">Đang tải…</p>}
    </div>
  );
}
