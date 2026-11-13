import React, { useEffect, useRef, useState } from 'react';
import { Save, Loader2, RefreshCw, Upload, ChevronDown, ChevronRight, Plus, Trash2, CalendarRange } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { Field, cardCls, inputCls, inputBorder, btnPrimary, btnSecondary, btnGhost } from './ui.jsx';

const CYCLE_OPTIONS = [['install', 'Sau lắp đặt'], ['year1', 'Sau 1 năm (1VH)'], ['annual', 'Định kỳ 1 năm'], ['y3', 'Định kỳ 3 năm'], ['y6', 'Định kỳ 6 năm'], ['tc', 'Tăng cường']];
const COLUMNS = [['station', 'Trạm'], ['bay', 'Ngăn lộ'], ['code', 'Mã thiết bị'], ['device', 'Danh mục thiết bị'], ['include', 'Có TNĐK (cột)'],
  ['inspection', 'Kiểm định AT'], ['note', 'Ghi chú'], ['testDate', 'Ngày thí nghiệm'], ['transmission', 'Truyền tải điện']];

const formOf = (p) => ({ ...p, cycles: Object.entries(p.columns.cycles).map(([col, cycle]) => ({ col, cycle })) });
const bodyOf = (f) => ({
  year: f.year, url: f.url, sheet: f.sheet, headerRows: f.headerRows,
  columns: { ...f.columns, cycles: Object.fromEntries(f.cycles.filter(c => c.col.trim()).map(c => [c.col.trim().toUpperCase(), c.cycle])) }
});

/** Một kế hoạch năm: link, trang tính, cột; lưu, đồng bộ theo link / file .xlsx, xóa; báo cáo lần đồng bộ gần nhất. */
function YearPlan({ plan, open, onToggle, onChanged }) {
  const { api, notify, confirmAction } = useDkct();
  const [form, setForm] = useState(() => formOf(plan));
  const [busy, setBusy] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const file = useRef(null);
  useEffect(() => { setForm(formOf(plan)); }, [plan]);

  const run = async (name, fn) => {
    setBusy(name);
    try { await fn(); } catch (err) { notify(err.message, 'error'); } finally { setBusy(''); }
  };
  const save = () => api.put(`/test-plan/plans/${plan.year}`, bodyOf(form));
  const onSave = (e) => {
    e.preventDefault();
    run('save', async () => { const r = await save(); onChanged(r.plans, r.plan.year); notify(`Đã lưu kế hoạch năm ${r.plan.year}.`, 'success'); });
  };
  const synced = (r) => {
    onChanged(r.plans, r.status.year);
    notify(`Đã đồng bộ kế hoạch năm ${r.status.year}: ${r.status.selected} thiết bị của ${r.status.stations.length} trạm.`, 'success');
  };
  const syncLink = () => run('sync', async () => { const r = await save(); synced(await api.post(`/test-plan/plans/${r.plan.year}/sync`, {})); });
  const syncFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    run('file', async () => {
      const r = await save();
      const fd = new FormData();
      fd.append('fileName', f.name);
      fd.append('file', f);
      synced(await api.sendForm(`/test-plan/plans/${r.plan.year}/sync`, fd, 'POST'));
    });
  };
  const remove = async () => {
    if (!(await confirmAction({ title: `Xóa kế hoạch năm ${plan.year}?`, message: 'Xóa cài đặt và các thiết bị đã đồng bộ của năm này. Phương án đã lập giữ nguyên nội dung.', confirmLabel: 'Xóa' }))) return;
    run('delete', async () => { const r = await api.del(`/test-plan/plans/${plan.year}`); onChanged(r.plans); notify(`Đã xóa kế hoạch năm ${plan.year}.`, 'success'); });
  };

  const st = plan.status;
  const col = (key) => (
    <input aria-label={`Cột ${key}`} className={`${inputCls} ${inputBorder()} !w-16 uppercase`} maxLength={3} value={form.columns[key] || ''}
      onChange={e => setForm(f => ({ ...f, columns: { ...f.columns, [key]: e.target.value.toUpperCase() } }))} />
  );
  return (
    <li className={cardCls}>
      <div className="flex items-center gap-2">
        <button type="button" className={btnGhost} aria-expanded={open} aria-label={open ? `Thu kế hoạch năm ${plan.year}` : `Mở kế hoạch năm ${plan.year}`} onClick={onToggle}>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <CalendarRange className="w-4 h-4 text-chatlan-600" aria-hidden="true" />
        <span className="font-bold text-slate-900 dark:text-white">Năm {plan.year}</span>
        <span className="flex-1 min-w-0 truncate text-xs text-slate-500">
          {st ? `${st.selected} thiết bị · ${st.stations.length} trạm · đồng bộ ${new Date(st.at).toLocaleString('vi-VN')}` : 'chưa đồng bộ'} · trang "{plan.sheet}"
        </span>
        <button type="button" className={btnGhost} aria-label={`Xóa kế hoạch năm ${plan.year}`} onClick={remove} disabled={!!busy}><Trash2 className="w-4 h-4" /></button>
      </div>
      {open && (
        <form onSubmit={onSave} className="mt-3 space-y-3">
          <Field label="Link Google Sheet" htmlFor={`tp-url-${plan.year}`}
            hint='Đồng bộ theo link: sheet chia sẻ "Bất kỳ ai có đường liên kết" (Người xem). Không chia sẻ: Tệp → Tải xuống → .xlsx rồi bấm "Tải file .xlsx".'>
            <input id={`tp-url-${plan.year}`} className={`${inputCls} ${inputBorder()}`} value={form.url} placeholder="https://docs.google.com/spreadsheets/d/…/edit"
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Trang tính" htmlFor={`tp-sheet-${plan.year}`}><input id={`tp-sheet-${plan.year}`} className={`${inputCls} ${inputBorder()}`} value={form.sheet} onChange={e => setForm(f => ({ ...f, sheet: e.target.value }))} /></Field>
            <Field label="Năm kế hoạch" htmlFor={`tp-year-${plan.year}`} hint="Đổi năm: các thiết bị đã đồng bộ chuyển theo.">
              <input id={`tp-year-${plan.year}`} type="number" min="2000" max="2100" className={`${inputCls} ${inputBorder()}`} value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} />
            </Field>
            <Field label="Số dòng tiêu đề" htmlFor={`tp-head-${plan.year}`}><input id={`tp-head-${plan.year}`} type="number" min="0" max="20" className={`${inputCls} ${inputBorder()}`} value={form.headerRows} onChange={e => setForm(f => ({ ...f, headerRows: e.target.value }))} /></Field>
          </div>

          <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300" aria-expanded={advanced} onClick={() => setAdvanced(v => !v)}>
            {advanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Cột của sheet (chữ cái cột)
          </button>
          {advanced && (
            <div className="space-y-3 pl-5">
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {COLUMNS.map(([key, label]) => <label key={key} className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">{col(key)} {label}</label>)}
                <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                  <input aria-label="Giá trị có TNĐK" className={`${inputCls} ${inputBorder()} !w-16`} value={form.columns.includeValue}
                    onChange={e => setForm(f => ({ ...f, columns: { ...f.columns, includeValue: e.target.value } }))} /> Giá trị có TNĐK
                </label>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Cột chu kỳ (có đánh dấu, vd "x", thì lấy)</p>
                {form.cycles.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input aria-label={`Cột chu kỳ ${i + 1}`} className={`${inputCls} ${inputBorder()} !w-16 uppercase`} maxLength={3} value={c.col}
                      onChange={e => setForm(f => ({ ...f, cycles: f.cycles.map((x, j) => (j === i ? { ...x, col: e.target.value.toUpperCase() } : x)) }))} />
                    <select aria-label={`Chu kỳ của cột ${c.col}`} className={`${inputCls} ${inputBorder()} !w-48`} value={c.cycle}
                      onChange={e => setForm(f => ({ ...f, cycles: f.cycles.map((x, j) => (j === i ? { ...x, cycle: e.target.value } : x)) }))}>
                      {CYCLE_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button type="button" className="text-xs text-slate-500 hover:text-red-600" onClick={() => setForm(f => ({ ...f, cycles: f.cycles.filter((_, j) => j !== i) }))}>Bỏ</button>
                  </div>
                ))}
                <button type="button" className="text-xs font-semibold text-chatlan-700 dark:text-chatlan-300" onClick={() => setForm(f => ({ ...f, cycles: [...f.cycles, { col: '', cycle: 'annual' }] }))}>+ Thêm cột chu kỳ</button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="submit" className={btnSecondary} disabled={!!busy}>{busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu</button>
            <button type="button" className={btnPrimary} onClick={syncLink} disabled={!!busy || !form.url}>
              {busy === 'sync' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Đồng bộ từ link
            </button>
            <input ref={file} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={syncFile} />
            <button type="button" className={btnSecondary} onClick={() => file.current?.click()} disabled={!!busy}>
              {busy === 'file' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Tải file .xlsx
            </button>
          </div>

          {st && (
            <div className="space-y-1 border-t border-slate-100 dark:border-slate-800 pt-2">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Đồng bộ {new Date(st.at).toLocaleString('vi-VN')} từ {st.from} · trang "{st.sheet}": {st.selected} thiết bị cần thí nghiệm / {st.rows} dòng có trạm và thiết bị.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 text-xs text-slate-700 dark:text-slate-300">
                {st.stations.map(s => <li key={s.name} className="flex justify-between gap-2 border-b border-slate-100 dark:border-slate-800 py-0.5"><span>{s.name}</span><span className="tabular-nums text-slate-500">{s.count}</span></li>)}
              </ul>
            </div>
          )}
        </form>
      )}
    </li>
  );
}

/**
 * Cài đặt → Kế hoạch thí nghiệm (admin): mỗi năm một kế hoạch (Google Sheet / file .xlsx). Thêm kế hoạch năm mới (chép cột
 * của năm gần nhất), sửa, đồng bộ lại khi kế hoạch thay đổi, xóa. Phương án lấy thiết bị theo kế hoạch của năm phương án.
 */
export default function TestPlanSettingsPanel() {
  const { api, notify } = useDkct();
  const [plans, setPlans] = useState(null);
  const [open, setOpen] = useState(null); // năm đang mở
  const [newYear, setNewYear] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.get('/test-plan/plans').then(r => { setPlans(r.plans); setOpen(r.plans[0]?.year ?? null); }).catch(err => notify(err.message, 'error'));
  }, [api, notify]);

  const changed = (list, year) => { setPlans(list); if (year !== undefined) setOpen(year); };
  const suggested = plans?.length ? plans[0].year + 1 : new Date().getFullYear() + 1;
  const add = async (e) => {
    e.preventDefault();
    const year = Number(newYear || suggested);
    if (plans.some(p => p.year === year)) { setOpen(year); return; }
    setAdding(true);
    try {
      const r = await api.put(`/test-plan/plans/${year}`, {});
      changed(r.plans, year);
      setNewYear('');
      notify(`Đã thêm kế hoạch năm ${year} (cột theo kế hoạch năm gần nhất). Dán link / tải file rồi đồng bộ.`, 'success');
    } catch (err) { notify(err.message, 'error'); } finally { setAdding(false); }
  };

  if (!plans) return <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-chatlan-600" /></div>;
  return (
    <div className="space-y-3 max-w-3xl">
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Mỗi năm một kế hoạch thí nghiệm định kỳ (Google Sheet, mỗi dòng một thiết bị). Lấy các dòng có <b>TNĐK</b> và có đánh dấu chu kỳ hoặc
        kiểm định AT. Kế hoạch sửa trên sheet thì bấm đồng bộ lại. Khi lập phương án (bước Phụ lục I) chọn thiết bị của trạm theo kế hoạch
        của năm phương án để điền Bảng 1 và bảng thiết bị cần thí nghiệm.
      </p>
      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <input type="number" min="2000" max="2100" aria-label="Năm kế hoạch mới" className={`${inputCls} ${inputBorder()} !w-28`}
          value={newYear} placeholder={String(suggested)} onChange={e => setNewYear(e.target.value)} />
        <button type="submit" className={btnPrimary} disabled={adding}>
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Thêm kế hoạch năm
        </button>
      </form>
      {plans.length ? (
        <ul className="space-y-2">
          {plans.map(p => <YearPlan key={p.year} plan={p} open={open === p.year} onToggle={() => setOpen(o => (o === p.year ? null : p.year))} onChanged={changed} />)}
        </ul>
      ) : (
        <p className="text-sm text-slate-500" role="status">Chưa có kế hoạch nào. Thêm kế hoạch năm, dán link Google Sheet (hoặc tải file .xlsx) rồi đồng bộ.</p>
      )}
    </div>
  );
}
