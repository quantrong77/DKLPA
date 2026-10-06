import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Zap, Upload, Search, FilePlus2, Loader2, CheckCircle2, AlertTriangle, X, ClipboardList, FileStack, Circle, CloudDownload, CalendarX2, CalendarPlus, CalendarClock, FilePenLine, LocateFixed, ExternalLink, History, Users, CalendarCheck, Eye, EyeOff } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { btnPrimary, btnSecondary, btnGhost, cardCls, inputCls, inputBorder, formatDateTime } from './ui.jsx';
import { TrackButton, rowFrame } from './WorkflowBar.jsx';
import { CHANGE_TONES } from './OutageAlert.jsx';
import { OutageHistory, AutoFetchStatus } from './OutageHistory.jsx';
import OutagePurge from './OutagePurge.jsx';

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayIso = () => isoOf(new Date());
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoOf(d); };

const MINE_KEY = 'dkct.outages.mineOnly';
const SHOW_KEY = 'dkct.outages.show'; // khung tải lịch, khung thống kê: ẩn/hiện (trình duyệt nhớ)

function loadShow() {
  try { return { fetch: true, stats: true, ...JSON.parse(localStorage.getItem(SHOW_KEY) || '{}') }; } catch { return { fetch: true, stats: true }; }
}

/** Nút "con mắt" ẩn/hiện một khung. */
function EyeToggle({ shown, label, title, onClick }) {
  const Icon = shown ? Eye : EyeOff;
  return (
    <button type="button" aria-pressed={shown} onClick={onClick}
      className={`${btnSecondary} ${shown ? '' : '!text-slate-400 border-dashed'}`}
      title={`${shown ? 'Ẩn' : 'Hiện'} ${title}`} aria-label={`${shown ? 'Ẩn' : 'Hiện'} ${title}`}>
      <Icon className={`w-4 h-4 ${shown ? 'text-chatlan-600' : 'text-slate-400'}`} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

/** Trang lịch cắt điện của Công ty (mạng nội bộ): tải file Excel về rồi nạp ở nút bên cạnh. */
export const OUTAGE_SOURCE_URL = 'https://home.ptc3.npt.evn.vn/lichcatdien_new2/';

/** "2 hoãn, 1 dời lịch, 1 sửa nội dung, 3 phát sinh" (bỏ mục bằng 0) */
export function changeCounts(cmp) {
  if (!cmp) return '';
  const parts = [[cmp.postponed, 'hoãn'], [cmp.moved, 'dời lịch'], [cmp.edited, 'sửa nội dung'], [cmp.added, 'phát sinh'], [cmp.restored, 'có lại']]
    .filter(([list]) => list?.length).map(([list, label]) => `${list.length} ${label}`);
  return parts.length ? parts.join(', ') : 'không có thay đổi';
}

/** Một dòng lịch trong danh sách hoãn/dời/sửa/phát sinh; bấm để tới dòng đó trong danh sách lịch. */
function ChangeItem({ r, onLocate }) {
  return (
    <li>
      <button type="button" className="w-full text-left flex items-start gap-2 px-2 py-1 rounded hover:bg-white/70 dark:hover:bg-slate-900/60 disabled:cursor-default"
        disabled={!r.id || !onLocate} onClick={() => onLocate(r)} title={r.id && onLocate ? 'Tới dòng này trong danh sách lịch' : undefined}>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold">{formatDateTime(r.regStart)} → {formatDateTime(r.regEnd)} · {r.location}</span>
          <span className="block line-clamp-2">{r.content}</span>
          {r.reason && <span className="block italic opacity-80">{r.reason}</span>}
        </span>
        {r.id && onLocate && <LocateFixed className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />}
      </button>
    </li>
  );
}

/** Kết quả so sánh với lịch đã nạp: hoãn (đỏ), dời lịch (xanh), sửa nội dung (tím), phát sinh (vàng); lịch không đổi chỉ đếm. */
export function CompareSummary({ compare, onLocate, title }) {
  if (!compare) return null;
  return (
    <div className="space-y-2" role="status">
      <p className="text-sm text-slate-700 dark:text-slate-200">
        {title || 'So với lịch đã nạp'} từ {compare.from.split('-').reverse().join('/')} đến {compare.to.split('-').reverse().join('/')} ({compare.previous} dòng):{' '}
        <b className="text-red-700 dark:text-red-400">{compare.postponed.length} hoãn</b>,{' '}
        <b className="text-sky-700 dark:text-sky-400">{(compare.moved || []).length} dời lịch</b>,{' '}
        <b className="text-violet-700 dark:text-violet-400">{(compare.edited || []).length} sửa nội dung</b>,{' '}
        <b className="text-amber-700 dark:text-amber-400">{compare.added.length} phát sinh</b>, {compare.unchanged} không đổi.
      </p>
      {compare.postponed.length > 0 && (
        <details open className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-900 dark:text-red-200">
          <summary className="cursor-pointer px-3 py-1.5 font-semibold inline-flex items-center gap-1"><CalendarX2 className="w-3.5 h-3.5" /> Hoãn ({compare.postponed.length})</summary>
          <ul className="px-1 pb-1.5 max-h-48 overflow-y-auto">{compare.postponed.map(r => <ChangeItem key={`p-${r.rowHash}`} r={r} onLocate={onLocate} />)}</ul>
        </details>
      )}
      {(compare.moved || []).length > 0 && (
        <details open className="rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/30 text-xs text-sky-900 dark:text-sky-200">
          <summary className="cursor-pointer px-3 py-1.5 font-semibold inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Dời lịch ({compare.moved.length})</summary>
          <ul className="px-1 pb-1.5 max-h-48 overflow-y-auto">{compare.moved.map(r => <ChangeItem key={`m-${r.rowHash}`} r={r} onLocate={onLocate} />)}</ul>
        </details>
      )}
      {(compare.edited || []).length > 0 && (
        <details open className="rounded-lg border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/30 text-xs text-violet-900 dark:text-violet-200">
          <summary className="cursor-pointer px-3 py-1.5 font-semibold inline-flex items-center gap-1"><FilePenLine className="w-3.5 h-3.5" /> Sửa nội dung ({compare.edited.length})</summary>
          <ul className="px-1 pb-1.5 max-h-48 overflow-y-auto">{compare.edited.map(r => <ChangeItem key={`e-${r.rowHash}`} r={r} onLocate={onLocate} />)}</ul>
        </details>
      )}
      {(compare.restored || []).length > 0 && (
        <details className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-900 dark:text-emerald-200">
          <summary className="cursor-pointer px-3 py-1.5 font-semibold inline-flex items-center gap-1"><CalendarCheck className="w-3.5 h-3.5" /> Có lại trong lịch ({compare.restored.length})</summary>
          <ul className="px-1 pb-1.5 max-h-48 overflow-y-auto">{compare.restored.map(r => <ChangeItem key={`r-${r.rowHash}`} r={r} onLocate={onLocate} />)}</ul>
        </details>
      )}
      {compare.added.length > 0 && (
        <details open className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200">
          <summary className="cursor-pointer px-3 py-1.5 font-semibold inline-flex items-center gap-1"><CalendarPlus className="w-3.5 h-3.5" /> Phát sinh ({compare.added.length})</summary>
          <ul className="px-1 pb-1.5 max-h-48 overflow-y-auto">{compare.added.map(r => <ChangeItem key={`a-${r.rowHash}`} r={r} onLocate={onLocate} />)}</ul>
        </details>
      )}
    </div>
  );
}

function ImportBox({ onDone, onLocate }) {
  const { api, notify } = useDkct();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [range, setRange] = useState({ from: '', to: '', on: true }); // khoảng so sánh với lịch đã nạp
  const [result, setResult] = useState(null);                         // kết quả lần cập nhật gần nhất
  const [busy, setBusy] = useState(false);
  // tải tự động từ trang Công ty (khi máy chủ có tài khoản): khoảng ngày cần tải
  const [source, setSource] = useState(null); // { configured }
  const [fetchRange, setFetchRange] = useState(() => ({ from: todayIso(), to: inDays(14) }));
  const [fetching, setFetching] = useState(false);
  const [fetched, setFetched] = useState(null); // { rows, inserted, updated, from, to } của lần tải gần nhất
  useEffect(() => { api.get('/outages/source').then(setSource).catch(() => setSource({ configured: false })); }, [api]);

  const fetchNow = async () => {
    if (!fetchRange.from || !fetchRange.to || fetchRange.from > fetchRange.to) { notify('Chọn khoảng ngày cần tải (từ ngày ≤ đến ngày).', 'error'); return; }
    setFetching(true);
    try {
      const res = await api.post('/outages/fetch', fetchRange);
      setResult(res.compare);
      setFetched(res);
      notify(`Đã tải ${res.rows} dòng lịch (${fetchRange.from.split('-').reverse().join('/')}–${fetchRange.to.split('-').reverse().join('/')}): thêm ${res.inserted}, cập nhật ${res.updated}${res.compare ? `; ${changeCounts(res.compare)}` : ''}.`, 'success');
      onDone();
    } catch (err) { notify(err.message, 'error'); } finally { setFetching(false); }
  };

  const send = (path, f, r) => {
    const form = new FormData();
    form.append('file', f);
    if (r.on && r.from && r.to) { form.append('compareFrom', r.from); form.append('compareTo', r.to); }
    return api.sendForm(path, form, 'POST');
  };
  const choose = async (f) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setBusy(true);
    try {
      // lần đầu: lấy khoảng ngày của file làm khoảng so sánh mặc định, rồi xem trước kèm so sánh
      const first = await send('/outages/import/preview', f, { on: false });
      const r = { from: first.span?.from || '', to: first.span?.to || '', on: !!first.span };
      setRange(r);
      setPreview(r.on ? await send('/outages/import/preview', f, r) : first);
    } catch (err) { notify(err.message, 'error'); setFile(null); } finally { setBusy(false); }
  };
  const changeRange = async (patch) => {
    const r = { ...range, ...patch };
    setRange(r);
    if (!file || (r.on && (!r.from || !r.to || r.from > r.to))) return;
    setBusy(true);
    try { setPreview(await send('/outages/import/preview', file, r)); } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  };
  const commit = async () => {
    setBusy(true);
    try {
      const res = await send('/outages/import/commit', file, range);
      notify(`Đã cập nhật lịch: thêm ${res.inserted}, cập nhật ${res.updated} dòng${res.compare ? `; ${changeCounts(res.compare)}` : ''}.`, 'success');
      setResult(res.compare);
      setFile(null); setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      onDone();
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  };
  const reset = () => { setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ''; };
  const fresh = preview ? preview.rows.filter(r => !r.alreadyImported).length : 0;
  const cmpPv = preview?.compare;
  const changes = cmpPv ? cmpPv.postponed.length + cmpPv.added.length + (cmpPv.moved || []).length + (cmpPv.edited || []).length : 0;

  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-end gap-2">
        {source?.configured ? (
          <>
            {/* máy chủ tự đăng nhập trang Công ty, tải lịch theo khoảng ngày và nạp luôn (so với lịch đã nạp cùng khoảng) */}
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Tải từ ngày
              <input type="date" aria-label="Tải lịch từ ngày" value={fetchRange.from} onChange={e => setFetchRange(r => ({ ...r, from: e.target.value }))} className={`${inputCls} ${inputBorder()} block mt-1`} />
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">đến ngày
              <input type="date" aria-label="Tải lịch đến ngày" value={fetchRange.to} onChange={e => setFetchRange(r => ({ ...r, to: e.target.value }))} className={`${inputCls} ${inputBorder()} block mt-1`} />
            </label>
            <button type="button" className={btnPrimary} onClick={fetchNow} disabled={fetching || busy}
              title="Máy chủ tải lịch cắt điện từ trang Công ty theo khoảng ngày rồi cập nhật luôn">
              {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />} Tải lịch cắt điện
            </button>
            <a href={OUTAGE_SOURCE_URL} target="_blank" rel="noopener noreferrer" className={btnGhost}
              aria-label="Mở trang lịch cắt điện của Công ty" title="Mở trang lịch cắt điện của Công ty (mạng nội bộ)">
              <ExternalLink className="w-4 h-4" />
            </a>
          </>
        ) : (
          <a href={OUTAGE_SOURCE_URL} target="_blank" rel="noopener noreferrer" className={btnSecondary}
            title="Mở trang lịch cắt điện của Công ty (mạng nội bộ) để tải file Excel. Khi admin đã đặt tài khoản (Danh mục → Tải lịch tự động) thì nút này tự tải và cập nhật.">
            <CloudDownload className="w-4 h-4 text-chatlan-600" /> Tải lịch cắt điện
          </a>
        )}
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" id="dk-outage-file" onChange={e => choose(e.target.files?.[0])} />
        <label htmlFor="dk-outage-file" className={`${btnSecondary} cursor-pointer`}>
          {busy && !preview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4 text-chatlan-600" />}
          Chọn file lịch cắt điện (Excel)
        </label>
        {file && <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[16rem]">{file.name}</span>}
        {preview && <button type="button" className={btnGhost} aria-label="Hủy import" onClick={reset}><X className="w-4 h-4" /></button>}
      </div>
      {!preview && !result && fetched && (
        <p className="mt-3 text-sm text-slate-700 dark:text-slate-200" role="status">
          Đã tải {fetched.rows} dòng lịch: thêm {fetched.inserted}, cập nhật {fetched.updated}. Khoảng này trước đó chưa có lịch nên chưa so sánh hoãn/phát sinh; lần tải sau sẽ so sánh.
        </p>
      )}
      {!preview && result && (
        <div className="mt-3">
          <div className="flex items-start gap-2">
            <div className="flex-1"><CompareSummary compare={result} onLocate={onLocate} title="Kết quả cập nhật: so với lịch đã nạp" /></div>
            <button type="button" className={btnGhost} aria-label="Ẩn kết quả so sánh" onClick={() => setResult(null)}><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}
      {preview && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-slate-700 dark:text-slate-200 flex flex-wrap gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {fresh} dòng mới</span>
            <span>{preview.rows.length - fresh} dòng đã có</span>
            {preview.duplicates > 0 && <span>{preview.duplicates} dòng trùng trong file</span>}
            {preview.errors.length > 0 && <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="w-4 h-4" /> {preview.errors.length} dòng lỗi</span>}
          </p>
          <div className="flex flex-wrap items-end gap-2 text-xs text-slate-600 dark:text-slate-300">
            <label className="inline-flex items-center gap-1.5 pb-2">
              <input type="checkbox" checked={range.on} onChange={e => changeRange({ on: e.target.checked })} /> So sánh với lịch đã nạp
            </label>
            {range.on && (
              <>
                <label className="font-semibold">Từ ngày
                  <input type="date" aria-label="So sánh từ ngày" value={range.from} onChange={e => changeRange({ from: e.target.value })} className={`${inputCls} ${inputBorder()} block mt-1`} />
                </label>
                <label className="font-semibold">Đến ngày
                  <input type="date" aria-label="So sánh đến ngày" value={range.to} onChange={e => changeRange({ to: e.target.value })} className={`${inputCls} ${inputBorder()} block mt-1`} />
                </label>
                <span className="pb-2">Mặc định theo khoảng ngày của file; lịch đã nạp trong khoảng mà file không còn sẽ đánh dấu hoãn.</span>
              </>
            )}
            {busy && <Loader2 className="w-4 h-4 animate-spin mb-2" aria-label="Đang so sánh" />}
          </div>
          {preview.compare && <CompareSummary compare={preview.compare} title="Dự kiến so với lịch đã nạp" />}
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
          <button type="button" className={btnPrimary} onClick={commit} disabled={busy || (fresh === 0 && changes === 0 && !preview.compare)}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {preview.compare ? ` Cập nhật lịch (${changeCounts(preview.compare)})` : ` Lưu ${fresh} dòng mới vào kế hoạch`}
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
  emerald: 'text-emerald-700 dark:text-emerald-400',
  red: 'text-red-700 dark:text-red-400',
  sky: 'text-sky-700 dark:text-sky-400',
  violet: 'text-violet-700 dark:text-violet-400'
};

// dấu so sánh khi nạp lại lịch
const CHANGE_FILTERS = [
  { id: 'change:POSTPONED', label: 'Hoãn', test: o => o.changeKind === 'POSTPONED', tone: 'red' },
  { id: 'change:MOVED', label: 'Dời lịch', test: o => o.changeKind === 'MOVED', tone: 'sky' },
  { id: 'change:EDITED', label: 'Sửa nội dung', test: o => o.changeKind === 'EDITED', tone: 'violet' },
  { id: 'change:NEW', label: 'Phát sinh', test: o => o.changeKind === 'NEW', tone: 'amber' }
];

// khung dòng lịch theo dấu so sánh: hoãn đỏ, dời lịch xanh, sửa nội dung tím, phát sinh vàng; không đổi giữ như thường
const CHANGE_FRAME = {
  POSTPONED: 'bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800',
  MOVED: 'bg-sky-50 dark:bg-sky-950/30 border border-sky-300 dark:border-sky-800',
  EDITED: 'bg-violet-50 dark:bg-violet-950/30 border border-violet-300 dark:border-violet-800',
  NEW: 'bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-300 dark:border-yellow-800'
};
const CHANGE_TAG = Object.fromEntries(Object.entries({ POSTPONED: 'Hoãn', MOVED: 'Dời lịch', EDITED: 'Sửa nội dung', NEW: 'Phát sinh' })
  .map(([k, label]) => [k, { label, cls: CHANGE_TONES[k].tag }]));

function StatsBar({ items, filter, onFilter }) {
  const shown = [...FILTERS, ...CHANGE_FILTERS.filter(f => items.some(f.test))];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2" role="group" aria-label="Thống kê tiến độ theo dòng lịch">
      {shown.map(f => {
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
export default function OutagePanel({ selectedId, linked, onTrack, reloadKey, canCreate, canPurge, canConfigure, onCreateFromOutage, onCreateSurveyFromOutage, onCreatePlanFromOutage }) {
  const { api, notify, EmptyState } = useDkct();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [pending, setPending] = useState(null); // dòng cần tới sau khi tải lại danh sách
  const [flash, setFlash] = useState(null);     // dòng vừa tới: viền nhấp nháy
  // "Chỉ tổ của tôi": dòng thuộc khu vực tổ phụ trách hoặc tổ đã lập hồ sơ (nhớ theo trình duyệt)
  const [mineOnly, setMineOnly] = useState(() => { try { return localStorage.getItem(MINE_KEY) === '1'; } catch { return false; } });
  const [myAreas, setMyAreas] = useState([]);
  const [mySubs, setMySubs] = useState([]); // trạm tổ đã tích chọn
  const [historyOf, setHistoryOf] = useState(() => new Set()); // dòng đang mở lịch sử
  const [refresh, setRefresh] = useState(0);
  const [show, setShow] = useState(loadShow);
  const toggleShow = (key) => setShow(s => {
    const next = { ...s, [key]: !s[key] };
    try { localStorage.setItem(SHOW_KEY, JSON.stringify(next)); } catch { /* bỏ qua */ }
    return next;
  });
  const toggleMine = () => setMineOnly(v => { try { localStorage.setItem(MINE_KEY, v ? '0' : '1'); } catch { /* bỏ qua */ } return !v; });
  const base = useMemo(() => (mineOnly ? items.filter(o => o.mine) : items), [items, mineOnly]);
  const shown = useMemo(() => base.filter(([...FILTERS, ...CHANGE_FILTERS].find(f => f.id === filter) || FILTERS[0]).test), [base, filter]);
  const toggleHistory = (id) => setHistoryOf(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ from, to, search });
      const res = await api.get(`/outages?${q}`);
      setItems(res.items);
      setMyAreas(res.myAreas || []);
      setMySubs(res.mySubstations || []);
      setRefresh(n => n + 1);
    } catch (err) { notify(err.message, 'error'); } finally { setLoading(false); }
  }, [api, notify, from, to, search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load, reloadKey]);

  // tới một dòng hoãn/phát sinh: mở rộng khoảng ngày nếu cần, bỏ lọc, cuộn tới và làm nổi bật
  const locate = (r) => {
    const day = String(r.regStart || '').slice(0, 10);
    setFilter('all');
    setMineOnly(false); // dòng cần tới có thể không thuộc tổ (không đổi lựa chọn đã nhớ)
    setSearch('');
    if (day && from > day) setFrom(day);
    if (day && to && to < day) setTo('');
    setPending(r.id);
  };
  useEffect(() => {
    if (!pending || loading) return undefined;
    const el = document.getElementById(`outage-${pending}`);
    if (!el) return undefined;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlash(pending);
    setPending(null);
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [items, pending, loading]);

  return (
    <div className="space-y-3">
      {/* ẩn bằng CSS (không gỡ khỏi trang): đang xem trước file / kết quả so sánh thì vẫn giữ nguyên */}
      <div className="space-y-3" hidden={!show.fetch}>
        <AutoFetchStatus refresh={refresh} canConfigure={canConfigure} />
        {canCreate && <ImportBox onDone={load} onLocate={locate} />}
      </div>
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
        <button type="button" aria-pressed={mineOnly} onClick={toggleMine}
          className={`${btnSecondary} ${mineOnly ? '!bg-chatlan-600 !text-white !border-chatlan-600' : ''}`}
          title="Chỉ hiện dòng lịch thuộc khu vực tổ phụ trách, hoặc tổ đã lập biên bản / phương án / giấy ĐKCT">
          <Users className="w-4 h-4" /> Chỉ tổ của tôi
        </button>
        {canPurge && <OutagePurge onDone={load} />}
        <div className="flex gap-1" role="group" aria-label="Ẩn/hiện khung">
          <EyeToggle shown={show.fetch} label="Tải lịch" title="khung tải lịch cắt điện" onClick={() => toggleShow('fetch')} />
          {/* ẩn thống kê thì bỏ lọc theo thẻ thống kê (không còn thấy để bỏ) */}
          <EyeToggle shown={show.stats} label="Thống kê" title="khung thống kê" onClick={() => { if (show.stats) setFilter('all'); toggleShow('stats'); }} />
        </div>
      </div>
      {mineOnly && (
        <p className="text-xs text-slate-600 dark:text-slate-300" role="note">
          {myAreas.length || mySubs.length
            ? <>{mySubs.length > 0
              ? <>Trạm tổ phụ trách ({mySubs.length}): <b>{mySubs.length > 10 ? `${mySubs.slice(0, 10).join(', ')}…` : mySubs.join(', ')}</b>. </>
              : <>Khu vực tổ phụ trách: <b>{myAreas.join(', ')}</b>. </>}
              {mySubs.length > 0 && myAreas.length > 0 && <>Dòng lịch không ghi rõ trạm: theo khu vực {myAreas.join(', ')}. </>}
              Cùng các dòng tổ đã lập hồ sơ.</>
            : <>Tổ chưa chọn khu vực phụ trách — chỉ hiện dòng tổ đã lập hồ sơ. Admin chọn khu vực ở <b>Danh mục</b>.</>}
        </p>
      )}

      {show.stats && base.length > 0 && <StatsBar items={base} filter={filter} onFilter={setFilter} />}

      {!loading && shown.length === 0 ? (
        base.length > 0 || (mineOnly && items.length > 0) ? (
          <EmptyState icon={CheckCircle2} title="Không có dòng lịch nào khớp bộ lọc"
            description={mineOnly && base.length === 0 ? 'Không có dòng nào của tổ trong khoảng này. Bỏ "Chỉ tổ của tôi" để xem tất cả.' : 'Bấm lại thẻ thống kê đang chọn để xem tất cả.'} />
        ) : 
        <EmptyState icon={Zap} title="Không có lịch cắt điện trong khoảng này"
          description={canCreate ? 'Import file Excel lịch cắt điện ở trên, hoặc đổi khoảng ngày.' : 'Đổi khoảng ngày để xem lịch khác.'} />
      ) : (
        <ul className="space-y-2" aria-busy={loading}>
          {shown.map(o => (
            <li key={o.id} id={`outage-${o.id}`}
              className={`${o.id !== selectedId && !linked?.has(o.id) && CHANGE_FRAME[o.changeKind] ? CHANGE_FRAME[o.changeKind] : rowFrame(o.id, selectedId, linked)} rounded-xl p-3 shadow-sm transition-shadow ${flash === o.id ? 'ring-4 ring-chatlan-400' : ''}`}>
              <div className="flex flex-wrap items-start gap-2">
                {onTrack && <TrackButton active={o.id === selectedId} linked={linked?.has(o.id)} onClick={() => onTrack(o)} />}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-chatlan-700 dark:text-chatlan-300">
                    {CHANGE_TAG[o.changeKind] && (
                      <span className={`inline-block mr-1.5 px-1.5 py-0.5 rounded text-[11px] font-bold ${CHANGE_TAG[o.changeKind].cls}`}>{CHANGE_TAG[o.changeKind].label}</span>
                    )}
                    {formatDateTime(o.regStart)} → {formatDateTime(o.regEnd)} · {o.location}
                  </p>
                  {o.changeNote && o.changeKind !== 'NEW' && <p className="text-xs font-semibold mt-0.5 text-slate-700 dark:text-slate-200">{o.changeNote}</p>}
                  <p className="text-sm text-slate-900 dark:text-white mt-1 whitespace-pre-line line-clamp-3">{o.content}</p>
                  {o.scope && <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 whitespace-pre-line line-clamp-2">Phạm vi: {o.scope}</p>}
                  <p className="text-xs text-slate-500 mt-1">ĐV công tác: {o.workUnit} · {o.status}</p>
                  <StepTracker outage={o} />
                  {o.changeCount > 0 && (
                    <button type="button" onClick={() => toggleHistory(o.id)} aria-expanded={historyOf.has(o.id)}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-chatlan-700 dark:text-slate-300">
                      <History className="w-3.5 h-3.5" /> Lịch sử thay đổi ({o.changeCount})
                    </button>
                  )}
                  {historyOf.has(o.id) && <div className="mt-1.5"><OutageHistory outageId={o.id} /></div>}
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
