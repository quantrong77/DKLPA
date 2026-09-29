import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Zap, Upload, Search, FilePlus2, Loader2, CheckCircle2, AlertTriangle, X, ClipboardList, FileStack, Circle } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { btnPrimary, btnSecondary, btnGhost, cardCls, inputCls, inputBorder, formatDateTime } from './ui.jsx';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function ImportBox({ onDone }) {
  const { api, notify } = useDkct();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const choose = async (f) => {
    if (!f) return;
    setFile(f);
    setBusy(true);
    try { setPreview(await api.upload('/outages/import/preview', f)); } catch (err) { notify(err.message, 'error'); setFile(null); } finally { setBusy(false); }
  };
  const commit = async () => {
    setBusy(true);
    try {
      const res = await api.upload('/outages/import/commit', file);
      notify(`Đã thêm ${res.inserted} dòng lịch, bỏ qua ${res.skipped} dòng đã có.`, 'success');
      setFile(null); setPreview(null);
      onDone();
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  };
  const reset = () => { setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ''; };
  const fresh = preview ? preview.rows.filter(r => !r.alreadyImported).length : 0;

  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" id="dk-outage-file" onChange={e => choose(e.target.files?.[0])} />
        <label htmlFor="dk-outage-file" className={`${btnSecondary} cursor-pointer`}>
          {busy && !preview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-chatlan-600" />}
          Chọn file lịch cắt điện (Excel)
        </label>
        {file && <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[16rem]">{file.name}</span>}
        {preview && <button type="button" className={btnGhost} aria-label="Hủy import" onClick={reset}><X className="w-4 h-4" /></button>}
      </div>
      {preview && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-slate-700 dark:text-slate-200 flex flex-wrap gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {fresh} dòng mới</span>
            <span>{preview.rows.length - fresh} dòng đã có</span>
            {preview.duplicates > 0 && <span>{preview.duplicates} dòng trùng trong file</span>}
            {preview.errors.length > 0 && <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="w-4 h-4" /> {preview.errors.length} dòng lỗi</span>}
          </p>
          {preview.errors.length > 0 && (
            <ul className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 max-h-28 overflow-y-auto">
              {preview.errors.map(e => <li key={e.row}>Dòng {e.row}: {e.message}</li>)}
            </ul>
          )}
          <div className="max-h-64 overflow-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                <tr className="text-left text-slate-600 dark:text-slate-300">
                  <th className="p-2">Dòng</th><th className="p-2">Thời gian</th><th className="p-2">Địa điểm</th><th className="p-2">Nội dung</th><th className="p-2">ĐV công tác</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map(r => (
                  <tr key={r.rowHash} className={`border-t border-slate-100 dark:border-slate-800 ${r.alreadyImported ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
                    <td className="p-2">{r.sourceRow}</td>
                    <td className="p-2 whitespace-nowrap">{formatDateTime(r.regStart)}<br />{formatDateTime(r.regEnd)}</td>
                    <td className="p-2">{r.location}</td>
                    <td className="p-2 line-clamp-3">{r.content}</td>
                    <td className="p-2">{r.workUnit}{r.alreadyImported && <span className="block italic">đã có</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className={btnPrimary} onClick={commit} disabled={busy || fresh === 0}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Lưu {fresh} dòng mới vào kế hoạch
          </button>
        </div>
      )}
    </div>
  );
}

// 3 bước hồ sơ cho một dòng lịch, theo thứ tự lập
const STEPS = [
  { key: 'surveyCount', label: 'Biên bản KSHT', icon: ClipboardList },
  { key: 'planCount', label: 'Phương án', icon: FileStack },
  { key: 'registrationCount', label: 'Giấy ĐKCT', icon: FilePlus2 }
];
const doneSteps = (o) => STEPS.filter(s => o[s.key] > 0).length;

// bộ lọc theo tiến độ; 'missing:<key>' = chưa có hồ sơ của bước đó
const FILTERS = [
  { id: 'all', label: 'Tổng dòng lịch', test: () => true, tone: 'slate' },
  { id: 'none', label: 'Chưa bắt đầu', test: o => doneSteps(o) === 0, tone: 'amber' },
  ...STEPS.map(s => ({ id: `missing:${s.key}`, label: `Chưa có ${s.label}`, test: o => !(o[s.key] > 0), tone: 'amber' })),
  { id: 'done', label: 'Đủ 3 bước', test: o => doneSteps(o) === STEPS.length, tone: 'emerald' }
];
const TONES = {
  slate: 'text-slate-900 dark:text-white',
  amber: 'text-amber-700 dark:text-amber-400',
  emerald: 'text-emerald-700 dark:text-emerald-400'
};

function StatsBar({ items, filter, onFilter }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" role="group" aria-label="Thống kê tiến độ theo dòng lịch">
      {FILTERS.map(f => {
        const n = items.filter(f.test).length;
        const active = filter === f.id;
        return (
          <button key={f.id} type="button" aria-pressed={active} onClick={() => onFilter(active ? 'all' : f.id)}
            className={`text-left rounded-xl border px-3 py-2 transition-colors ${active
              ? 'border-chatlan-500 bg-chatlan-50 dark:bg-chatlan-900/40'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-chatlan-300'}`}>
            <span className={`block text-xl font-bold ${TONES[f.tone]}`}>{n}</span>
            <span className="block text-xs text-slate-600 dark:text-slate-300">{f.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Tiến độ một dòng lịch: Biên bản KSHT → Phương án → Giấy ĐKCT (số hồ sơ của tổ mình). */
function StepTracker({ outage }) {
  const done = doneSteps(outage);
  const overall = done === STEPS.length
    ? { text: 'Hoàn tất', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' }
    : done === 0
      ? { text: 'Chưa bắt đầu', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' }
      : { text: `Đang làm ${done}/${STEPS.length}`, cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className={`px-2 py-0.5 rounded-full font-semibold ${overall.cls}`}>{overall.text}</span>
      {STEPS.map((s, i) => {
        const n = outage[s.key];
        return (
          <React.Fragment key={s.key}>
            {i > 0 && <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">→</span>}
            <span className={`inline-flex items-center gap-1 ${n > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {n > 0 ? <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> : <Circle className="w-3.5 h-3.5" aria-hidden="true" />}
              {s.label}{n > 0 ? ` (${n})` : ': chưa có'}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** Lịch cắt điện = kế hoạch công tác: import Excel, lọc, theo dõi tiến độ, lập biên bản/phương án/giấy từ một dòng. */
export default function OutagePanel({ canCreate, onCreateFromOutage, onCreateSurveyFromOutage, onCreatePlanFromOutage }) {
  const { api, notify, EmptyState } = useDkct();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const shown = useMemo(() => items.filter((FILTERS.find(f => f.id === filter) || FILTERS[0]).test), [items, filter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ from, to, search });
      setItems((await api.get(`/outages?${q}`)).items);
    } catch (err) { notify(err.message, 'error'); } finally { setLoading(false); }
  }, [api, notify, from, to, search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-3">
      {canCreate && <ImportBox onDone={load} />}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Từ ngày
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${inputCls} ${inputBorder()} block mt-1`} />
        </label>
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Đến ngày
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className={`${inputCls} ${inputBorder()} block mt-1`} />
        </label>
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" aria-label="Tìm lịch" placeholder="Tìm trạm, thiết bị, đơn vị…" value={search}
            onChange={e => setSearch(e.target.value)} className={`${inputCls} ${inputBorder()} pl-8`} />
        </div>
      </div>

      {items.length > 0 && <StatsBar items={items} filter={filter} onFilter={setFilter} />}

      {!loading && shown.length === 0 ? (
        items.length > 0 ? (
          <EmptyState icon={CheckCircle2} title="Không có dòng lịch nào khớp bộ lọc"
            description="Bấm lại thẻ thống kê đang chọn để xem tất cả." />
        ) : 
        <EmptyState icon={Zap} title="Không có lịch cắt điện trong khoảng này"
          description={canCreate ? 'Import file Excel lịch cắt điện ở trên, hoặc đổi khoảng ngày.' : 'Đổi khoảng ngày để xem lịch khác.'} />
      ) : (
        <ul className="space-y-2" aria-busy={loading}>
          {shown.map(o => (
            <li key={o.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-chatlan-700 dark:text-chatlan-300">
                    {formatDateTime(o.regStart)} → {formatDateTime(o.regEnd)} · {o.location}
                  </p>
                  <p className="text-sm text-slate-900 dark:text-white mt-1 whitespace-pre-line line-clamp-3">{o.content}</p>
                  {o.scope && <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 whitespace-pre-line line-clamp-2">Phạm vi: {o.scope}</p>}
                  <p className="text-xs text-slate-500 mt-1">ĐV công tác: {o.workUnit} · {o.status}</p>
                  <StepTracker outage={o} />
                </div>
                {canCreate && (
                  <div className="flex flex-col gap-1.5">
                    <button type="button" className={btnSecondary} onClick={() => onCreateSurveyFromOutage(o)}>
                      <ClipboardList className="w-4 h-4 text-chatlan-600" /> Lập biên bản KSHT{o.surveyCount > 0 ? ` (đã có ${o.surveyCount})` : ''}
                    </button>
                    <button type="button" className={btnSecondary} onClick={() => onCreatePlanFromOutage(o)}>
                      <FileStack className="w-4 h-4 text-chatlan-600" /> Lập phương án{o.planCount > 0 ? ` (đã có ${o.planCount})` : ''}
                    </button>
                    <button type="button" className={btnSecondary} onClick={() => onCreateFromOutage(o)}>
                      <FilePlus2 className="w-4 h-4 text-chatlan-600" /> Tạo giấy ĐKCT{o.registrationCount > 0 ? ` (đã có ${o.registrationCount})` : ''}
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
