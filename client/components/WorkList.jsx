import React, { useCallback, useEffect, useState } from 'react';
import { Search, Trash2, Eye, Pencil, MapPin } from 'lucide-react';
import { IconHelmet, IconPylon, IconSafetyPlan, IconPermit } from './powerIcons.jsx';
import { useDkct } from '../context.jsx';
import { useLatestRequest } from '../lib/latest.js';
import { btnGhost, btnSecondary, inputCls, inputBorder, formatDateTime, ListError, NoMatch, TimeBox } from './ui.jsx';
import { TrackButton, rowFrame } from './WorkflowBar.jsx';

const range = (a, b) => [formatDateTime(a), formatDateTime(b)].filter(Boolean).join(' → ');

/**
 * Công việc không có lịch cắt điện của tổ (admin thấy tất cả): gốc của luồng thay cho dòng lịch.
 * Mỗi dòng có nút lập biên bản KSHT / phương án / giấy ĐKCT điền sẵn từ công việc.
 */
export default function WorkList({ selectedId, linked, onTrack, reloadKey, canCreate, onOpen, onCreateSurvey, onCreatePlan, onCreateRegistration }) {
  const { api, notify, confirmAction, EmptyState } = useDkct();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(null);
  const latest = useLatestRequest();
  const [search, setSearch] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const load = useCallback(async () => {
    const isLatest = latest(); // chỉ nhận kết quả của lần tải mới nhất
    setLoading(true);
    try {
      const { items: rows } = await api.get(`/works?${new URLSearchParams({ search, year })}`);
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
    if (!(await confirmAction({ title: 'Xóa công việc?', message: String(item.content || '').slice(0, 200), danger: true }))) return;
    try {
      await api.del(`/works/${item.id}`);
      notify('Đã xóa công việc.', 'success');
      load();
    } catch (err) { notify(err.message, 'error'); }
  };
  const used = (n) => (n > 0 ? ` (đã có ${n})` : '');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" aria-label="Tìm công việc" placeholder="Tìm theo nội dung, trạm, thiết bị…" value={search}
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
        <EmptyState icon={IconHelmet} title="Chưa có công việc nào"
          description={canCreate
            ? 'Việc không đăng ký cắt điện: bấm "Thêm công việc", rồi lập biên bản KSHT, phương án, giấy ĐKCT từ công việc đó.'
            : 'Công việc do trưởng/phó đơn vị thêm sẽ hiện ở đây.'} />
      ) : (
        <ul className="space-y-2" aria-busy={loading}>
          {items.map(item => (
            <li key={item.id} className={`${rowFrame(item.id, selectedId, linked)} rounded-xl p-3 shadow-sm`}>
              <div className="flex flex-wrap items-start gap-3">
                {onTrack && <TrackButton active={item.id === selectedId} linked={linked?.has(item.id)} onClick={() => onTrack(item)} />}
                <button type="button" className="flex-1 min-w-[12rem] text-left" onClick={() => onOpen(item)}>
                  <p className="text-xs font-semibold text-chatlan-700 dark:text-chatlan-300">
                    {range(item.startTime, item.endTime)
                      ? <TimeBox title="Thời gian thực hiện">{range(item.startTime, item.endTime)}</TimeBox>
                      : 'Chưa ghi thời gian'}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 whitespace-pre-line">{item.content}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                    {[item.location, item.stationName].filter(Boolean).join(' · ').replace(/\s+/g, ' ')}
                    {item.scope ? ` · ${item.scope}` : ''}
                  </p>
                </button>
                <div className="flex items-center gap-1">
                  {item.canEdit ? (
                    <button type="button" className={btnSecondary} onClick={() => onOpen(item)}><Pencil className="w-4 h-4 text-chatlan-600" /> Sửa</button>
                  ) : (
                    <button type="button" className={btnGhost} aria-label="Xem" onClick={() => onOpen(item)}><Eye className="w-4 h-4" /></button>
                  )}
                  {item.canEdit && <button type="button" className={btnGhost} aria-label="Xóa" onClick={() => remove(item)}><Trash2 className="w-4 h-4" /></button>}
                </div>
              </div>
              {canCreate && (
                <div className="mt-2 flex flex-wrap gap-1.5 sm:pl-10">
                  <button type="button" className={btnSecondary} onClick={() => onCreateSurvey(item)}>
                    <IconPylon className="w-4 h-4 text-chatlan-600" /> Lập biên bản KSHT{used(item.surveyCount)}
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => onCreatePlan(item)}>
                    <IconSafetyPlan className="w-4 h-4 text-chatlan-600" /> Lập phương án{used(item.planCount)}
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => onCreateRegistration(item)}>
                    <IconPermit className="w-4 h-4 text-chatlan-600" /> Tạo giấy ĐKCT{used(item.registrationCount)}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {loading && items.length === 0 && <p className="text-xs text-slate-500">Đang tải…</p>}
    </div>
  );
}
