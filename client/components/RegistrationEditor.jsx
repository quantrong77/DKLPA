import React, { useEffect, useMemo, useState } from 'react';
import { X, Save, FileDown, Loader2, AlertTriangle, Eye } from 'lucide-react';
import { useDkct } from '../context.jsx';
import EditorWork from './EditorWork.jsx';
import EditorPeople from './EditorPeople.jsx';
import EditorAppendix from './EditorAppendix.jsx';
import { TabButton, btnPrimary, btnSecondary, btnGhost } from './ui.jsx';
import DocPreview from './DocPreview.jsx';
import { fieldErrors, pruneAfterChange } from '../lib/form.js';

const STEPS = [
  { id: 'work', label: '1. Chung & công việc', owns: /^(recipient|workContent|time|header|representative)/ },
  { id: 'people', label: '2. Nhân sự & ĐVCT', owns: /^(leader|supervisors|watchmen|workUnits|otherUnits)/ },
  { id: 'appendix', label: '3. Phụ lục 11, 13', owns: /^(nominees|permits|risks)/ }
];

function payloadOf(form) {
  const { workUnitCount, recipient, ...rest } = form;
  const { manual, ...cleanRecipient } = recipient || {};
  return { ...rest, recipient: cleanRecipient };
}

/**
 * Lập mới / sửa / xem giấy ĐKCT.
 * registration: null khi lập mới; { id, docNumber, canEdit } khi mở giấy đã lưu.
 */
export default function RegistrationEditor({ initial, registration, outage, catalogs, departments = [], docNumberPreview, onClose, onSaved }) {
  const { api, notify, confirmAction, downloadAuthenticatedFile, ModalOverlay } = useDkct();
  const [form, setForm] = useState(initial);
  const [step, setStep] = useState('work');
  const [errorList, setErrorList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const payload = () => payloadOf(form);
  const [dirty, setDirty] = useState(false);
  const readOnly = registration && !registration.canEdit;
  const errors = useMemo(() => fieldErrors(errorList), [errorList]);

  const update = (fn) => { setDirty(true); setForm(fn); };

  // Đổi ĐVCT / đề cử thì gỡ nhân viên không còn đăng ký khỏi phần cấp phiếu
  useEffect(() => {
    if (readOnly) return;
    const { form: next, removed } = pruneAfterChange(form);
    if (JSON.stringify(next.permits) !== JSON.stringify(form.permits)) {
      setForm(next);
      if (removed.length) notify(`Đã gỡ khỏi phần cấp phiếu: ${removed.join(', ')} (không còn trong danh sách đã đăng ký).`, 'warning');
    }
  }, [form.workUnits, form.nominees]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = async () => {
    if (dirty && !readOnly && !(await confirmAction({ title: 'Đóng giấy chưa lưu?', message: 'Các thay đổi chưa lưu sẽ bị hủy.', confirmLabel: 'Đóng, không lưu' }))) return;
    onClose();
  };

  async function save({ andDownload = false } = {}) {
    setSaving(true);
    try {
      const body = payloadOf(form);
      const res = registration
        ? await api.put(`/registrations/${registration.id}`, body)
        : await api.post('/registrations', body);
      setErrorList([]);
      setDirty(false);
      notify(`Đã lưu giấy đăng ký công tác số ${res.registration.docNumber}.`, 'success');
      if (andDownload) await download(res.registration);
      onSaved(res.registration);
    } catch (err) {
      if (err.status === 422) {
        setErrorList(err.errors);
        const first = err.errors[0]?.field || '';
        const owner = STEPS.find(s => s.owns.test(first));
        if (owner) setStep(owner.id);
      }
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function download(reg = registration) {
    try {
      await downloadAuthenticatedFile(`/api/dkct/registrations/${reg.id}/docx`, `DangKyCongTac_${reg.docNumber}.docx`);
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  const stepErrors = (s) => errorList.filter(e => s.owns.test(e.field)).length;
  const shared = { form, setForm: update, errors, personnel: catalogs.personnel, stations: catalogs.stations, departments, duties: catalogs.duties, riskLibrary: catalogs.risks, outage, docNumberPreview, isNew: !registration };

  return (
    <ModalOverlay onClose={close} className="fixed inset-0 z-50 bg-slate-900/40 flex items-stretch md:items-center justify-center md:p-4">
      <div className="bg-slate-50 dark:bg-slate-950 w-full md:max-w-5xl md:rounded-2xl shadow-xl flex flex-col max-h-full md:max-h-[92vh]">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
              {registration ? `${readOnly ? 'Giấy' : 'Hiệu chỉnh giấy'} ĐKCT số ${registration.docNumber}` : 'Lập giấy đăng ký công tác'}
            </h2>
            {readOnly && <p className="text-xs text-slate-500">Chỉ xem — bạn không có quyền sửa giấy này.</p>}
            {registration && !readOnly && (
              <p className="text-xs text-chatlan-700 dark:text-chatlan-300">Đang hiệu chỉnh — số giấy giữ nguyên; bấm "Lưu thay đổi" để cập nhật, rồi tải lại file Word.</p>
            )}
          </div>
          <button type="button" className={btnGhost} aria-label="Đóng" onClick={close}><X className="w-5 h-5" /></button>
        </header>

        <nav className="flex gap-2 px-4 py-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto bg-white dark:bg-slate-900" aria-label="Các phần của giấy">
          {STEPS.map(s => (
            <TabButton key={s.id} active={step === s.id} onClick={() => setStep(s.id)}>
              {s.label}{stepErrors(s) > 0 && <span className="ml-1 text-red-600">({stepErrors(s)} lỗi)</span>}
            </TabButton>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-4">
          {errorList.length > 0 && (
            <div className="mb-3 flex gap-2 p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-sm text-red-700 dark:text-red-300" role="alert">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <ul className="list-disc pl-4 space-y-0.5">{errorList.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
            </div>
          )}
          <fieldset disabled={readOnly} className="space-y-4 min-w-0">
            {step === 'work' && <EditorWork {...shared} />}
            {step === 'people' && <EditorPeople {...shared} />}
            {step === 'appendix' && <EditorAppendix {...shared} />}
          </fieldset>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:rounded-b-2xl">
          <button type="button" className={`${btnSecondary} mr-auto`} onClick={() => setPreviewing(true)} disabled={saving} title="Xem bản Word trước khi lưu/tải">
            <Eye className="w-4 h-4" /> Xem trước
          </button>
          {registration && (
            <button type="button" className={btnSecondary} onClick={() => download()} disabled={saving || dirty}
              title={dirty ? 'Lưu thay đổi trước khi tải' : undefined}>
              <FileDown className="w-4 h-4" /> Tải Word
            </button>
          )}
          {!readOnly && (
            <>
              <button type="button" className={btnSecondary} onClick={() => save({ andDownload: true })} disabled={saving}>
                <FileDown className="w-4 h-4" /> Lưu & tải Word
              </button>
              <button type="button" className={btnPrimary} onClick={() => save()} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {registration ? 'Lưu thay đổi' : 'Lưu & cấp số'}
              </button>
            </>
          )}
        </footer>
        {previewing && (
          <DocPreview
            title={registration ? `Giấy ĐKCT ${registration.docNumber}` : 'Giấy ĐKCT (chưa lưu)'}
            note={(readOnly || (registration && !dirty)) ? 'Bản đã lưu' : `Bản dựng từ dữ liệu đang soạn — chưa lưu${registration ? '' : ', số chỉ là dự kiến'}`}
            load={() => ((readOnly || (registration && !dirty))
              ? api.blob(`/registrations/${registration.id}/docx`)
              : api.previewDocx(registration ? `/registrations/${registration.id}/preview` : `/registrations/preview?docNumber=${encodeURIComponent(docNumberPreview || '')}`, payload()))}
            onDownload={(readOnly || (registration && !dirty)) ? () => download() : () => { setPreviewing(false); save({ andDownload: true }); }}
            downloadLabel={(readOnly || (registration && !dirty)) ? 'Tải Word' : 'Lưu & tải Word'}
            pdf={(readOnly || (registration && !dirty))}
            onClose={() => setPreviewing(false)} />
        )}
      </div>
    </ModalOverlay>
  );
}
