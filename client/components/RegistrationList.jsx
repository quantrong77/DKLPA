import React, { useCallback, useEffect, useState } from 'react';
import { Search, FileDown, Trash2, Eye, Hash, Pencil, ScanEye } from 'lucide-react';
import { IconPermit, IconEnergize } from './powerIcons.jsx';
import { useDkct } from '../context.jsx';
import { useLatestRequest } from '../lib/latest.js';
import { btnGhost, btnSecondary, inputCls, inputBorder, formatDateTime, ListError, NoMatch } from './ui.jsx';
import DocPreview from './DocPreview.jsx';
import { TrackButton, rowFrame } from './WorkflowBar.jsx';
import { OutageChangeTag } from './OutageAlert.jsx';

/** Danh sách giấy ĐKCT của tổ (admin thấy tất cả). */
export default function RegistrationList({ selectedId, linked, onTrack, reloadKey, onOpen, numbering, canCreate, onNumberingChanged, onCreateConfirmation }) {
  const { api, notify, confirmAction, downloadAuthenticatedFile, EmptyState } = useDkct();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(null);
  const latest = useLatestRequest();
  const [previewItem, setPreviewItem] = useState(null);
  const [search, setSearch] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const load = useCallback(async () => {
    const isLatest = latest(); // chỉ nhận kết quả của lần tải mới nhất
    setLoading(true);
    try {
      const q = new URLSearchParams({ search, year });
      const { items: rows } = await api.get(`/registrations?${q}`);
      if (!isLatest()) return;
      setItems(rows);
      setFailed(null);
    } catch (err) {
      if (!isLatest()) return;
      setFailed(err.message);
      notify(err.message, 'error');
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [api, notify, search, year, latest]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load, reloadKey]);

  const remove = async (item) => {
    if (!(await confirmAction({ title: `Xóa giấy số ${item.docNumber}?`, message: 'Số giấy của giấy này sẽ để trống trong sổ (không tự cấp lại).', danger: true }))) return;
    try {
      await api.del(`/registrations/${item.id}`);
      notify('Đã xóa giấy đăng ký công tác.', 'success');
      load();
    } catch (err) { notify(err.message, 'error'); }
  };

  const [startDraft, setStartDraft] = useState(null); // null = đang ẩn ô nhập số khởi đầu
  const setStart = async (e) => {
    e.preventDefault();
    try {
      await api.put('/numbering', { startNumber: startDraft });
      notify('Đã đặt số khởi đầu.', 'success');
      setStartDraft(null);
      onNumberingChanged();
    } catch (err) { notify(err.message, 'error'); }
  };

  const download = (item) => downloadAuthenticatedFile(`/api/dkct/registrations/${item.id}/docx`, `DangKyCongTac_${item.docNumber}.docx`)
    .catch(e => notify(e.message, 'error'));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" aria-label="Tìm giấy" placeholder="Tìm theo số giấy, nội dung, nơi nhận…" value={search}
            onChange={e => setSearch(e.target.value)} className={`${inputCls} ${inputBorder()} pl-8`} />
        </div>
        <select aria-label="Năm" value={year} onChange={e => setYear(e.target.value)} className={`${inputCls} ${inputBorder()} !w-28`}>
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
          <option value="">Mọi năm</option>
        </select>
        {numbering && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
            <Hash className="w-3.5 h-3.5" /> Số tiếp theo: <b>{numbering.preview}</b>
            {canCreate && startDraft === null && (
              <button type="button" className="ml-1 underline" onClick={() => setStartDraft(String(numbering.nextNumber))}>đặt số khởi đầu</button>
            )}
          </span>
        )}
        {startDraft !== null && (
          <form onSubmit={setStart} className="flex items-center gap-2 w-full sm:w-auto">
            <label htmlFor="dk-start-no" className="text-xs text-slate-600 dark:text-slate-300">
              Số khởi đầu năm {numbering.year} (số lớn nhất đã cấp {numbering.lastIssued}; đặt nhỏ hơn được, số đã dùng tự bỏ qua):
            </label>
            <input id="dk-start-no" type="number" min={1} value={startDraft} autoFocus
              onChange={e => setStartDraft(e.target.value)} className={`${inputCls} ${inputBorder()} !w-24`} />
            <button type="submit" className={btnSecondary}>Lưu</button>
            <button type="button" className={btnGhost} onClick={() => setStartDraft(null)}>Hủy</button>
          </form>
        )}
      </div>

      {failed && !loading && !items.length ? <ListError message={failed} onRetry={load} />
        : !loading && !items.length && search.trim() ? <NoMatch search={search} onClear={() => setSearch('')} />
        : !loading && items.length === 0 ? (
        <EmptyState icon={IconPermit} title="Chưa có giấy đăng ký công tác"
          description={canCreate ? 'Tạo giấy từ tab "Lịch cắt điện" hoặc bấm "Lập giấy mới".' : 'Giấy do trưởng/phó đơn vị lập sẽ hiện ở đây.'} />
      ) : (
        <ul className="space-y-2" aria-busy={loading}>
          {items.map(item => (
            <li key={item.id} className={`${rowFrame(item.id, selectedId, linked)} rounded-xl p-3 shadow-sm flex flex-wrap items-start gap-3`}>
              {onTrack && <TrackButton active={item.id === selectedId} linked={linked?.has(item.id)} onClick={() => onTrack(item)} />}
              <span className="font-mono font-bold text-sm px-2.5 py-0.5 rounded-lg bg-chatlan-50 dark:bg-chatlan-900/60 text-chatlan-700 dark:text-chatlan-300 border border-chatlan-200 dark:border-chatlan-900">
                {item.docNumber}
              </span>
              <button type="button" className="flex-1 min-w-[12rem] text-left" onClick={() => onOpen(item)}>
                <p className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2">{item.workContent}</p>
                {item.outageChange && <span className="block mt-0.5"><OutageChangeTag change={item.outageChange} /></span>}
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {formatDateTime(item.startTime)} → {formatDateTime(item.endTime)} · Kính gửi: {item.recipientName}
                </p>
              </button>
              <div className="flex items-center gap-1">
                {canCreate && onCreateConfirmation && (
                  <button type="button" className={btnSecondary} onClick={() => onCreateConfirmation(item)} title="Lập giấy xác nhận đủ điều kiện đóng điện từ giấy này">
                    <IconEnergize className="w-4 h-4 text-chatlan-600" /> Giấy xác nhận
                  </button>
                )}
                {item.canEdit ? (
                  <button type="button" className={btnSecondary} onClick={() => onOpen(item)} title="Hiệu chỉnh giấy (số giấy giữ nguyên)">
                    <Pencil className="w-4 h-4 text-chatlan-600" /> Sửa
                  </button>
                ) : (
                  <button type="button" className={btnGhost} aria-label="Xem" onClick={() => onOpen(item)}><Eye className="w-4 h-4" /></button>
                )}
                <button type="button" className={btnGhost} aria-label="Xem trước bản Word" title="Xem trước bản Word" onClick={() => setPreviewItem(item)}>
                  <ScanEye className="w-4 h-4" />
                </button>
                <button type="button" className={btnGhost} aria-label="Tải Word"
                  onClick={() => download(item)}>
                  <FileDown className="w-4 h-4" />
                </button>
                {item.canEdit && (
                  <button type="button" className={btnGhost} aria-label="Xóa" onClick={() => remove(item)}><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {loading && items.length === 0 && <p className="text-xs text-slate-500">Đang tải…</p>}
      {previewItem && (
        <DocPreview title={`Giấy ĐKCT ${previewItem.docNumber}`} load={() => api.blob(`/registrations/${previewItem.id}/docx`)}
          onDownload={() => download(previewItem)} onClose={() => setPreviewItem(null)} />
      )}
    </div>
  );
}
