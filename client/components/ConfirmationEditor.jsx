import React, { useEffect, useMemo, useState } from 'react';
import { X, Save, FileDown, Loader2, AlertTriangle, Eye, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { useEditorKeys } from '../lib/editorKeys.js';
import { Field, Section, inputCls, inputBorder, btnPrimary, btnSecondary, btnGhost, UnsavedBadge } from './ui.jsx';
import DocPreview from './DocPreview.jsx';
import { fieldErrors } from '../lib/form.js';
import { confirmationFromPlan, emptyItem } from '../lib/confirmation.js';

const move = (list, i, d) => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

/** Khối lượng và kết quả: mỗi mục "<nội dung>: <kết quả>" (mặc định "đạt"), đánh số 1, 2… như mẫu. */
function Items({ items, setItems, error }) {
  const set = (i, patch) => setItems(list => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-bold text-slate-700 dark:text-slate-300">Khối lượng và kết quả <span className="text-red-600">*</span></legend>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {items.map((it, i) => (
        <div key={i} className="flex gap-1.5 items-start">
          <span className="text-sm text-slate-500 pt-2 w-5 text-right">{i + 1}.</span>
          <textarea aria-label={`Mục ${i + 1}`} rows={1} className={`${inputCls} ${inputBorder()}`} value={it.text}
            placeholder="Thí nghiệm định kỳ máy cắt MC 212, các hạng mục theo QĐ 1901" onChange={e => set(i, { text: e.target.value })} />
          <input aria-label={`Kết quả ${i + 1}`} list="xn-results" className={`${inputCls} ${inputBorder()} !w-24`} value={it.result}
            onChange={e => set(i, { result: e.target.value })} />
          <button type="button" className={btnGhost} aria-label="Lên" onClick={() => setItems(l => move(l, i, -1))}><ArrowUp className="w-4 h-4" /></button>
          <button type="button" className={btnGhost} aria-label="Xuống" onClick={() => setItems(l => move(l, i, 1))}><ArrowDown className="w-4 h-4" /></button>
          <button type="button" className={btnGhost} aria-label={`Xóa mục ${i + 1}`} onClick={() => setItems(l => l.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      <datalist id="xn-results"><option value="đạt" /><option value="không đạt" /></datalist>
      <button type="button" className={btnSecondary} onClick={() => setItems(l => [...l, emptyItem()])}><Plus className="w-4 h-4" /> Thêm mục</button>
    </fieldset>
  );
}

/**
 * Lập / hiệu chỉnh Giấy xác nhận đủ điều kiện đóng điện.
 * confirmation: null khi lập mới; { id, docNumber, canEdit } khi mở giấy đã lưu.
 */
export default function ConfirmationEditor({ initial, confirmation, catalogs, departments = [], numberPreview, onClose, onSaved }) {
  const { api, notify, confirmAction, downloadAuthenticatedFile, ModalOverlay } = useDkct();
  const [form, setForm] = useState(initial);
  const [current, setCurrent] = useState(confirmation);
  const [errorList, setErrorList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [plans, setPlans] = useState([]);
  const readOnly = !!current && !current.canEdit;
  const errors = useMemo(() => fieldErrors(errorList), [errorList]);
  const update = (fn) => { setDirty(true); setForm(fn); };
  const setField = (key, value) => update(f => ({ ...f, [key]: typeof value === 'function' ? value(f[key]) : value }));
  const setHeader = (patch) => setField('header', h => ({ ...h, ...patch }));

  useEffect(() => { api.get('/plans').then(r => setPlans(r.items)).catch(() => {}); }, [api]);

  const substations = catalogs.substations || [];
  const choice = form.station?.substationId || (form.station?.manual || form.station?.name ? '__manual' : '');
  const chooseStation = (value) => {
    const s = substations.find(x => x.id === value);
    setField('station', s ? { substationId: s.id, name: s.name } : { substationId: null, name: value === '__manual' ? form.station?.name || '' : '', manual: value === '__manual' });
  };
  const teamOptions = departments.length ? [...new Set([...departments.map(d => d.name), form.header.teamName].filter(Boolean))] : [];

  const pickPlan = async (id) => {
    if (!id) return;
    try {
      const { plan } = await api.get(`/plans/${id}`);
      if (form.items.some(it => it.text.trim()) && !(await confirmAction({ title: 'Thay các mục kết quả?', message: 'Các mục hiện có sẽ được thay bằng các nhóm thiết bị trong Bảng 1 của phương án.' }))) return;
      update(f => confirmationFromPlan(f, plan));
      notify(`Đã lấy hạng mục từ phương án ${plan.docNumber}.`, 'success');
    } catch (err) { notify(err.message, 'error'); }
  };

  const close = async () => {
    if (dirty && !readOnly && !(await confirmAction({ title: 'Đóng giấy chưa lưu?', message: 'Các thay đổi chưa lưu sẽ bị hủy.', confirmLabel: 'Đóng, không lưu' }))) return;
    onClose();
  };

  async function download(target = current) {
    try {
      await downloadAuthenticatedFile(`/api/dkct/confirmations/${target.id}/docx`, `GiayXacNhan_${String(target.docNumber).replace(/\//g, '-')}.docx`);
    } catch (err) { notify(err.message, 'error'); }
  }

  const payload = () => {
    const { manual, ...station } = form.station || {};
    return { ...form, station };
  };

  async function save({ andDownload = false } = {}) {
    setSaving(true);
    try {
      const body = payload();
      const res = current ? await api.put(`/confirmations/${current.id}`, body) : await api.post('/confirmations', body);
      setCurrent(res.confirmation);
      setErrorList([]);
      setDirty(false);
      notify(`Đã lưu giấy xác nhận số ${res.confirmation.docNumber}.`, 'success');
      if (andDownload) await download(res.confirmation);
      onSaved(res.confirmation);
    } catch (err) {
      if (err.status === 422) setErrorList(err.errors);
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const input = (id, key, props = {}) => (
    <input id={id} className={`${inputCls} ${inputBorder(errors[key])}`} value={form[key] || ''} onChange={e => setField(key, e.target.value)} {...props} />
  );

  // Ctrl+S lưu; còn thay đổi chưa lưu thì trình duyệt hỏi lại khi đóng / tải lại tab
  useEditorKeys({ onSave: () => save(), dirty: !readOnly && dirty, disabled: saving || readOnly });

  return (
    <ModalOverlay onClose={close} className="fixed inset-0 z-50 bg-slate-900/40 flex items-stretch md:items-center justify-center md:p-4">
      <div className="bg-slate-50 dark:bg-slate-950 w-full md:max-w-4xl md:rounded-2xl shadow-xl flex flex-col max-h-full md:max-h-[92vh]">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
              {current ? `${readOnly ? 'Giấy xác nhận' : 'Hiệu chỉnh giấy xác nhận'} số ${current.docNumber}` : 'Lập giấy xác nhận đủ điều kiện đóng điện'}
            </h2>
            <p className="text-xs text-slate-500">{current ? 'Số giấy giữ nguyên khi hiệu chỉnh.' : `Số dự kiến: ${numberPreview || '…'} — cấp khi lưu`}{readOnly ? ' · Chỉ xem.' : ''}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <UnsavedBadge show={!readOnly && dirty} />
            <button type="button" className={btnGhost} aria-label="Đóng" onClick={close}><X className="w-5 h-5" /></button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {errorList.length > 0 && (
            <div className="mb-3 flex gap-2 p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-sm text-red-700 dark:text-red-300" role="alert">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <ul className="list-disc pl-4 space-y-0.5">{errorList.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
            </div>
          )}
          <fieldset disabled={readOnly} className="space-y-4 min-w-0">
            <Section title="Công trình">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Tên dự án / Tên trạm" htmlFor="xn-station" required error={errors.station}>
                  <select id="xn-station" className={`${inputCls} ${inputBorder(errors.station)}`} value={choice} onChange={e => chooseStation(e.target.value)}>
                    <option value="">— Chọn trạm —</option>
                    {substations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    <option value="__manual">Tự ghi…</option>
                  </select>
                  {choice === '__manual' && (
                    <input aria-label="Tên dự án / trạm (tự ghi)" className={`${inputCls} ${inputBorder(errors.station)} mt-2`} value={form.station?.name || ''}
                      placeholder="Trạm 220kV …" onChange={e => setField('station', { substationId: null, manual: true, name: e.target.value })} />
                  )}
                </Field>
                <Field label="Ngăn lộ" htmlFor="xn-bays" required error={errors.bays}>{input('xn-bays', 'bays', { placeholder: 'MC 212' })}</Field>
                <Field label="Ngày thực hiện" htmlFor="xn-workdate" required error={errors.workDate}>{input('xn-workdate', 'workDate', { type: 'date' })}</Field>
                <Field label="Đã thực hiện công tác thí nghiệm" htmlFor="xn-object" required error={errors.workObject}>{input('xn-object', 'workObject', { placeholder: 'MC 212' })}</Field>
              </div>
              <p className="text-xs text-slate-500">
                In: "Ngày …, toán công tác thuộc {[form.header.teamName, form.header.unitName].filter(Boolean).join(' – ') || '…'} đã thực hiện công tác thí nghiệm {form.workObject || '…'}, khối lượng và kết quả như sau:"
              </p>
            </Section>
            <Section title="Khối lượng, kết quả · Xác nhận">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="xn-plan" className="text-xs text-slate-600 dark:text-slate-300">Lấy hạng mục từ phương án:</label>
                <select id="xn-plan" className={`${inputCls} ${inputBorder()} !w-auto max-w-full`} value="" onChange={e => pickPlan(e.target.value)}>
                  <option value="">— Chọn phương án… —</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.docNumber} · {p.stationName} · {String(p.workTitle || '').slice(0, 60)}</option>)}
                </select>
              </div>
              <Items items={form.items} setItems={fn => setField('items', fn)} error={errors.items} />
              <Field label="Bằng giấy này, tôi xác nhận … đủ điều kiện đóng điện vận hành" htmlFor="xn-equipment" required error={errors.equipment}>
                {input('xn-equipment', 'equipment', { placeholder: 'máy cắt MC 212' })}
              </Field>
              <Field label="Ghi chú" htmlFor="xn-note" hint="Tùy chọn.">{input('xn-note', 'note')}</Field>
            </Section>
            <Section title="Đầu giấy · Ký">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Công ty" htmlFor="xn-company"><input id="xn-company" className={`${inputCls} ${inputBorder()}`} value={form.header.companyName || ''} onChange={e => setHeader({ companyName: e.target.value })} /></Field>
                <Field label="Đội" htmlFor="xn-unit"><input id="xn-unit" className={`${inputCls} ${inputBorder()}`} value={form.header.unitName || ''} onChange={e => setHeader({ unitName: e.target.value })} /></Field>
                <Field label="Tổ" htmlFor="xn-team">
                  {teamOptions.length ? (
                    <select id="xn-team" className={`${inputCls} ${inputBorder()}`} value={form.header.teamName || ''}
                      onChange={e => setHeader({ teamName: e.target.value, teamShort: departments.find(d => d.name === e.target.value)?.shortName || form.header.teamShort })}>
                      <option value="">— Chọn tổ —</option>
                      {teamOptions.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  ) : <input id="xn-team" className={`${inputCls} ${inputBorder()}`} value={form.header.teamName || ''} onChange={e => setHeader({ teamName: e.target.value })} />}
                </Field>
                <Field label="Người ký xác nhận" htmlFor="xn-signer" required error={errors.signer}>
                  <input id="xn-signer" list="xn-people" className={`${inputCls} ${inputBorder(errors.signer)}`} value={form.signer || ''} onChange={e => setField('signer', e.target.value)} />
                  <datalist id="xn-people">{(catalogs.personnel || []).map(p => <option key={p.id} value={p.fullName} />)}</datalist>
                </Field>
                <Field label="Địa danh" htmlFor="xn-place"><input id="xn-place" className={`${inputCls} ${inputBorder()}`} value={form.header.place || ''} placeholder="Khánh Hòa" onChange={e => setHeader({ place: e.target.value })} /></Field>
                <Field label="Ngày ký" htmlFor="xn-date"><input id="xn-date" type="date" className={`${inputCls} ${inputBorder()}`} value={form.header.date || ''} onChange={e => setHeader({ date: e.target.value })} /></Field>
              </div>
            </Section>
          </fieldset>
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:rounded-b-2xl">
          <button type="button" className={`${btnSecondary} mr-auto`} onClick={() => setPreviewing(true)} disabled={saving} title="Xem bản Word trước khi lưu/tải">
            <Eye className="w-4 h-4" /> Xem trước
          </button>
          {current && (
            <button type="button" className={btnSecondary} onClick={() => download()} disabled={saving || dirty} title={dirty ? 'Lưu thay đổi trước khi tải' : undefined}>
              <FileDown className="w-4 h-4" /> Tải Word
            </button>
          )}
          {!readOnly && (
            <>
              <button type="button" className={btnSecondary} onClick={() => save({ andDownload: true })} disabled={saving}><FileDown className="w-4 h-4" /> Lưu & tải Word</button>
              <button type="button" className={btnPrimary} onClick={() => save()} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {current ? 'Lưu thay đổi' : 'Lưu & cấp số'}
              </button>
            </>
          )}
        </footer>
        {previewing && (
          <DocPreview
            title={current ? `Giấy xác nhận ${current.docNumber}` : 'Giấy xác nhận (chưa lưu)'}
            note={(readOnly || (current && !dirty)) ? 'Bản đã lưu' : `Bản dựng từ dữ liệu đang soạn — chưa lưu${current ? '' : ', số chỉ là dự kiến'}`}
            load={() => ((readOnly || (current && !dirty))
              ? api.blob(`/confirmations/${current.id}/docx`)
              : api.previewDocx(current ? `/confirmations/${current.id}/preview` : `/confirmations/preview?docNumber=${encodeURIComponent(numberPreview || '')}`, payload()))}
            onDownload={(readOnly || (current && !dirty)) ? () => download() : () => { setPreviewing(false); save({ andDownload: true }); }}
            downloadLabel={(readOnly || (current && !dirty)) ? 'Tải Word' : 'Lưu & tải Word'}
            pdf={(readOnly || (current && !dirty))}
            onClose={() => setPreviewing(false)} />
        )}
      </div>
    </ModalOverlay>
  );
}
