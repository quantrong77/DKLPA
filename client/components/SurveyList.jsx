import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Search, FileDown, Trash2, Eye, Pencil, FilePlus2, FileStack, Image as ImageIcon, ScanEye, Upload } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { useLatestRequest } from '../lib/latest.js';
import { btnGhost, btnSecondary, inputCls, inputBorder, ListError, NoMatch } from './ui.jsx';
import DocPreview from './DocPreview.jsx';
import QltnLink, { QLTN_URL } from './QltnLink.jsx';
import { TrackButton, rowFrame } from './WorkflowBar.jsx';
import { OutageChangeTag } from './OutageAlert.jsx';
import { surveyTimeLabel } from '../lib/survey.js';

/** Danh sách biên bản khảo sát hiện trường của tổ (admin thấy tất cả). */
export default function SurveyList({ selectedId, linked, onTrack, reloadKey, onOpen, canCreate, onCreateRegistration, onCreatePlan }) {
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
      const { items: rows } = await api.get(`/surveys?${new URLSearchParams({ search, year })}`);
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
    if (!(await confirmAction({ title: 'Xóa biên bản khảo sát?', message: `${item.stationName} — ${surveyTimeLabel(item.surveyTime)}`, danger: true }))) return;
    try {
      await api.del(`/surveys/${item.id}`);
      notify('Đã xóa biên bản khảo sát.', 'success');
      load();
    } catch (err) { notify(err.message, 'error'); }
  };

  const download = (item) => downloadAuthenticatedFile(`/api/dkct/surveys/${item.id}/docx`,
    `BienBanKhaoSat_${String(item.surveyTime || '').slice(0, 10).replace(/-/g, '')}.docx`).catch(e => notify(e.message, 'error'));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" aria-label="Tìm biên bản" placeholder="Tìm theo trạm, nội dung…" value={search}
            onChange={e => setSearch(e.target.value)} className={`${inputCls} ${inputBorder()} pl-8`} />
        </div>
        <select aria-label="Năm" value={year} onChange={e => setYear(e.target.value)} className={`${inputCls} ${inputBorder()} !w-28`}>
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
          <option value="">Mọi năm</option>
        </select>
      </div>

      {failed && !loading && !items.length ? <ListError message={failed} onRetry={load} />
        : !loading && !items.length && search.trim() ? <NoMatch search={search} onClear={() => setSearch('')} />
        : !loading && items.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Chưa có biên bản khảo sát hiện trường"
          description={canCreate ? 'Bấm "Lập biên bản", hoặc lập từ một dòng ở tab "Lịch cắt điện".' : 'Biên bản do trưởng/phó tổ lập sẽ hiện ở đây.'} />
      ) : (
        <ul className="space-y-2" aria-busy={loading}>
          {items.map(item => (
            <li key={item.id} className={`${rowFrame(item.id, selectedId, linked)} rounded-xl p-3 shadow-sm flex flex-wrap items-start gap-3`}>
              {onTrack && <TrackButton active={item.id === selectedId} linked={linked?.has(item.id)} onClick={() => onTrack(item)} />}
              <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-chatlan-50 dark:bg-chatlan-900/60 text-chatlan-700 dark:text-chatlan-300 border border-chatlan-200 dark:border-chatlan-900">
                {surveyTimeLabel(item.surveyTime)}
              </span>
              <button type="button" className="flex-1 min-w-[12rem] text-left" onClick={() => onOpen(item)}>
                <p className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2">{item.workContent}</p>
                {item.outageChange && <span className="block mt-0.5"><OutageChangeTag change={item.outageChange} /></span>}
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 inline-flex items-center gap-1">
                  Tại: {item.stationName}
                  {item.hasDiagram && <span className="inline-flex items-center gap-0.5 ml-1" title="Có ảnh sơ đồ"><ImageIcon className="w-3.5 h-3.5" /> sơ đồ</span>}
                </p>
              </button>
              <div className="flex flex-wrap items-center gap-1">
                {canCreate && (
                  <button type="button" className={btnSecondary} onClick={() => onCreateRegistration(item)}
                    title="Lập giấy ĐKCT với căn cứ, nội dung, địa điểm và đánh giá rủi ro lấy từ biên bản này">
                    <FilePlus2 className="w-4 h-4 text-chatlan-600" /> Lập giấy ĐKCT
                  </button>
                )}
                {canCreate && onCreatePlan && (
                  <button type="button" className={btnSecondary} onClick={() => onCreatePlan(item)}
                    title="Lập phương án với trạm và bảng nhận diện rủi ro lấy từ biên bản này">
                    <FileStack className="w-4 h-4 text-chatlan-600" /> Lập phương án
                  </button>
                )}
                {item.canEdit ? (
                  <button type="button" className={btnSecondary} onClick={() => onOpen(item)}><Pencil className="w-4 h-4 text-chatlan-600" /> Sửa</button>
                ) : (
                  <button type="button" className={btnGhost} aria-label="Xem" onClick={() => onOpen(item)}><Eye className="w-4 h-4" /></button>
                )}
                <button type="button" className={btnGhost} aria-label="Xem trước bản Word" title="Xem trước bản Word" onClick={() => setPreviewItem(item)}>
                  <ScanEye className="w-4 h-4" />
                </button>
                <button type="button" className={btnGhost} aria-label="Tải Word" onClick={() => download(item)}><FileDown className="w-4 h-4" /></button>
                <a href={QLTN_URL} target="_blank" rel="noopener noreferrer" className={btnGhost} aria-label="Đăng QLTN" title="Mở trang QLTN để đăng file Word"><Upload className="w-4 h-4" /></a>
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
        <DocPreview title={'Biên bản khảo sát hiện trường'} load={() => api.blob(`/surveys/${previewItem.id}/docx`)}
          onDownload={() => download(previewItem)} actions={<QltnLink />} onClose={() => setPreviewItem(null)} />
      )}
    </div>
  );
}
