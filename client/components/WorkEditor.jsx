import React, { useMemo, useState } from 'react';
import { X, Save, Loader2, AlertTriangle } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { Field, Section, inputCls, inputBorder, btnPrimary, btnSecondary, btnGhost } from './ui.jsx';
import { fieldErrors } from '../lib/form.js';

/**
 * Thêm / sửa công việc không có lịch cắt điện (gốc của luồng thay cho dòng lịch).
 * work: null khi thêm mới; công việc đã lưu (có canEdit) khi sửa/xem.
 */
export default function WorkEditor({ initial, work, catalogs, onClose, onSaved }) {
  const { api, notify, confirmAction, ModalOverlay } = useDkct();
  const [form, setForm] = useState(initial);
  const [errorList, setErrorList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const readOnly = !!work && !work.canEdit;
  const errors = useMemo(() => fieldErrors(errorList), [errorList]);
  const setField = (key, value) => { setDirty(true); setForm(f => ({ ...f, [key]: value })); };

  const substations = (catalogs.substations || []).filter(s => s.active !== 0);
  const [manual, setManual] = useState(!form.substationId && !!form.stationName);
  const choice = form.substationId || (manual ? '__manual' : '');
  const chooseStation = (value) => {
    const s = substations.find(x => x.id === value);
    setManual(value === '__manual');
    setDirty(true);
    setForm(f => ({ ...f, substationId: s ? s.id : null, stationName: s ? s.name : value === '__manual' ? f.stationName : '' }));
  };

  const close = async () => {
    if (dirty && !readOnly && !(await confirmAction({ title: 'Đóng công việc chưa lưu?', message: 'Các thay đổi chưa lưu sẽ bị hủy.', confirmLabel: 'Đóng, không lưu' }))) return;
    onClose();
  };

  async function save() {
    setSaving(true);
    try {
      const body = { ...form, startTime: form.startTime || null, endTime: form.endTime || null };
      const res = work ? await api.put(`/works/${work.id}`, body) : await api.post('/works', body);
      setDirty(false);
      notify(work ? 'Đã lưu công việc.' : 'Đã thêm công việc. Lập biên bản KSHT, phương án hoặc giấy ĐKCT ngay trên dòng công việc.', 'success');
      onSaved(res.work);
    } catch (err) {
      if (err.status === 422) setErrorList(err.errors);
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const text = (id, key, props = {}) => (
    <input id={id} className={`${inputCls} ${inputBorder(errors[key])}`} value={form[key] || ''} onChange={e => setField(key, e.target.value)} {...props} />
  );

  return (
    <ModalOverlay onClose={close} className="fixed inset-0 z-50 bg-slate-900/40 flex items-stretch md:items-center justify-center md:p-4">
      <div className="bg-slate-50 dark:bg-slate-950 w-full md:max-w-2xl md:rounded-2xl shadow-xl flex flex-col max-h-full md:max-h-[92vh]">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
              {work ? (readOnly ? 'Công việc không có lịch cắt điện' : 'Sửa công việc') : 'Thêm công việc không có lịch cắt điện'}
            </h2>
            <p className="text-xs text-slate-500">
              {readOnly ? 'Chỉ xem.' : 'Dùng cho việc không đăng ký cắt điện (làm việc không cắt điện, kiểm tra, xử lý tồn tại…). Biên bản, phương án, giấy lập từ công việc được điền sẵn các mục dưới đây.'}
            </p>
          </div>
          <button type="button" className={btnGhost} aria-label="Đóng" onClick={close}><X className="w-5 h-5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {errorList.length > 0 && (
            <div className="mb-3 flex gap-2 p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-sm text-red-700 dark:text-red-300" role="alert">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <ul className="list-disc pl-4 space-y-0.5">{errorList.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
            </div>
          )}
          <fieldset disabled={readOnly} className="space-y-4 min-w-0">
            <Section title="Công việc">
              <Field label="Nội dung công việc" htmlFor="cv-content" required error={errors.content}>
                <textarea id="cv-content" rows={3} className={`${inputCls} ${inputBorder(errors.content)}`} value={form.content || ''}
                  placeholder="Kiểm tra, vệ sinh tủ điều khiển, bảo vệ ngăn 271" onChange={e => setField('content', e.target.value)} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Trạm" htmlFor="cv-station" error={errors.stationName} hint="Chọn trong danh mục để tự gắn đơn vị QLVH, bản vẽ trạm.">
                  <select id="cv-station" className={`${inputCls} ${inputBorder(errors.stationName)}`} value={choice} onChange={e => chooseStation(e.target.value)}>
                    <option value="">— Chọn trạm —</option>
                    {substations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    <option value="__manual">Tự ghi…</option>
                  </select>
                  {choice === '__manual' && (
                    <input aria-label="Tên trạm (tự ghi)" className={`${inputCls} ${inputBorder(errors.stationName)} mt-2`} value={form.stationName || ''}
                      placeholder="TBA 220kV …" onChange={e => setField('stationName', e.target.value)} />
                  )}
                </Field>
                <Field label="Địa điểm / thiết bị" htmlFor="cv-location" error={errors.location} hint="Ngăn lộ, thiết bị; mỗi dòng một mục.">
                  <textarea id="cv-location" rows={2} className={`${inputCls} ${inputBorder(errors.location)}`} value={form.location || ''}
                    placeholder="Ngăn 271" onChange={e => setField('location', e.target.value)} />
                </Field>
                <Field label="Bắt đầu" htmlFor="cv-start" error={errors.startTime}>{text('cv-start', 'startTime', { type: 'datetime-local' })}</Field>
                <Field label="Kết thúc" htmlFor="cv-end" error={errors.endTime}>{text('cv-end', 'endTime', { type: 'datetime-local' })}</Field>
              </div>
              <Field label="Điều kiện / phạm vi làm việc" htmlFor="cv-scope" error={errors.scope} hint="In vào mục điều kiện của giấy ĐKCT.">
                <textarea id="cv-scope" rows={2} className={`${inputCls} ${inputBorder(errors.scope)}`} value={form.scope || ''}
                  onChange={e => setField('scope', e.target.value)} />
              </Field>
              <Field label="Ghi chú" htmlFor="cv-note" error={errors.note} hint="Tùy chọn, chỉ để theo dõi (không in).">{text('cv-note', 'note')}</Field>
            </Section>
          </fieldset>
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:rounded-b-2xl">
          <button type="button" className={btnSecondary} onClick={close}>{readOnly ? 'Đóng' : 'Hủy'}</button>
          {!readOnly && (
            <button type="button" className={btnPrimary} onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {work ? 'Lưu thay đổi' : 'Lưu công việc'}
            </button>
          )}
        </footer>
      </div>
    </ModalOverlay>
  );
}
