import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Upload, Download, ScanEye, CheckCircle2, Pencil, Trash2, Replace, Loader2, AlertTriangle, Info, X, Save, Tags, ChevronDown } from 'lucide-react';
import { useDkct } from '../context.jsx';
import DocPreview from './DocPreview.jsx';
import { btnGhost, btnPrimary, btnSecondary, inputCls, inputBorder } from './ui.jsx';

const kb = (n) => (n ? `${Math.max(1, Math.round(n / 1024))} KB` : '');
const when = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(v || ''));
  return m ? `${m[4]}:${m[5]} ${m[3]}/${m[2]}/${m[1]}` : '';
};
const formOf = (file, fields = {}) => {
  const f = new FormData();
  f.append('file', file);
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};

/** Kết quả kiểm tra mẫu: lỗi (không lưu được) hoặc cảnh báo thẻ lạ / thiếu / nhãn ký số. */
function CheckReport({ report, errors }) {
  if (errors?.length) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-2.5 text-xs text-red-800 dark:text-red-200" role="alert">
        <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Mẫu chưa dùng được:</p>
        <ul className="list-disc pl-5 mt-1 space-y-0.5">{errors.map((e, i) => <li key={i}>{typeof e === 'string' ? e : e.message}</li>)}</ul>
      </div>
    );
  }
  if (!report) return null;
  const warn = report.unknown.length || report.missing.length || report.missingSigns.length;
  return (
    <div className={`rounded-lg border p-2.5 text-xs space-y-1 ${warn ? 'border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200'
      : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-200'}`} role="status">
      <p className="font-semibold flex items-center gap-1.5">
        {warn ? <Info className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
        Mẫu hợp lệ — đã thử điền bằng {report.sampleFrom}.
      </p>
      {report.unknown.length > 0 && <p>Thẻ không có trong mẫu gốc (sẽ để trống): <b>{report.unknown.map(t => `{${t}}`).join(', ')}</b></p>}
      {report.missing.length > 0 && <p>Thẻ của mẫu gốc mà mẫu này không dùng (nội dung đó không in ra): <b>{report.missing.map(t => `{${t}}`).join(', ')}</b></p>}
      {report.missingSigns.length > 0 && <p>Thiếu nhãn ký số của mẫu gốc: <b>{report.missingSigns.join(', ')}</b></p>}
    </div>
  );
}

/** Thẻ dữ liệu của mẫu gốc (để soạn mẫu mới trong Word). */
function TagList({ tags }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-chatlan-700 dark:text-slate-300"
        aria-expanded={open} onClick={() => setOpen(v => !v)}>
        <Tags className="w-3.5 h-3.5" /> Thẻ dữ liệu của mẫu gốc ({tags.fields.length})
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
          <p>Giữ nguyên các thẻ này trong Word (kể cả dấu ngoặc). <code>{'{#tên}'}</code>…<code>{'{/tên}'}</code> là đoạn lặp, <code>{'{@tên}'}</code> chèn nguyên khối (ảnh, bảng).</p>
          <div className="flex flex-wrap gap-1">
            {tags.fields.map(t => <code key={t} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100">{`{${t}}`}</code>)}
          </div>
          {tags.signs.length > 0 && (
            <p>Nhãn ký số (giữ nguyên để ứng dụng ký số nhận diện): {tags.signs.map(s => <code key={s} className="mr-1">{s}</code>)}</p>
          )}
        </div>
      )}
    </div>
  );
}

function KindCard({ kind, canManage, onChanged, onPreview }) {
  const { api, notify, confirmAction, downloadAuthenticatedFile } = useDkct();
  const [draft, setDraft] = useState(null); // { file, name, note, report, errors, checking }
  const [editing, setEditing] = useState(null); // { id, name, note }
  const [busy, setBusy] = useState('');
  const pickNew = useRef(null);
  const replaceOf = useRef({});
  const active = kind.items.find(i => i.active);

  const choose = async (file) => {
    if (!file) return;
    setDraft({ file, name: file.name.replace(/\.docx$/i, ''), note: '', report: null, errors: null, checking: true });
    try {
      const { report } = await api.sendForm(`/doc-templates/${kind.kind}/check`, formOf(file), 'POST');
      setDraft(d => d && { ...d, report, checking: false });
    } catch (err) {
      setDraft(d => d && { ...d, errors: err.errors?.length ? err.errors : [err.message], checking: false });
    }
  };
  const save = async (activate) => {
    setBusy('save');
    try {
      await api.sendForm(`/doc-templates/${kind.kind}`, formOf(draft.file, { name: draft.name, note: draft.note, activate: activate ? '1' : '' }), 'POST');
      notify(activate ? `Đã lưu và dùng mẫu "${draft.name}" cho ${kind.label.toLowerCase()}.` : `Đã lưu mẫu "${draft.name}".`, 'success');
      setDraft(null);
      if (pickNew.current) pickNew.current.value = '';
      onChanged();
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(''); }
  };
  const use = async (id, name) => {
    try {
      await api.put(`/doc-templates/${kind.kind}/active`, { id });
      notify(`${kind.label}: dùng ${id ? `mẫu "${name}"` : 'mẫu gốc'}.`, 'success');
      onChanged();
    } catch (err) { notify(err.message, 'error'); }
  };
  const replaceFile = async (item, file) => {
    if (!file) return;
    setBusy(item.id);
    try {
      const { report } = await api.sendForm(`/doc-templates/item/${item.id}/file`, formOf(file), 'POST');
      const warn = report.unknown.length + report.missing.length + report.missingSigns.length;
      notify(`Đã thay file của mẫu "${item.name}"${warn ? ' (có cảnh báo thẻ — xem bằng nút Kiểm tra khi tải lên mẫu mới)' : ''}.`, warn ? 'warning' : 'success');
      onChanged();
    } catch (err) {
      notify(`${err.message}${err.errors?.length ? ` ${err.errors[0]}` : ''}`, 'error');
    } finally {
      setBusy('');
      if (replaceOf.current[item.id]) replaceOf.current[item.id].value = '';
    }
  };
  const saveEdit = async () => {
    try {
      await api.put(`/doc-templates/item/${editing.id}`, { name: editing.name, note: editing.note });
      setEditing(null);
      onChanged();
    } catch (err) { notify(err.message, 'error'); }
  };
  const remove = async (item) => {
    if (!(await confirmAction({
      title: `Xóa mẫu "${item.name}"?`,
      message: item.active ? 'Mẫu này đang dùng: sau khi xóa, văn bản xuất theo mẫu gốc.' : 'File mẫu sẽ bị xóa hẳn.',
      confirmLabel: 'Xóa', danger: true
    }))) return;
    try { await api.del(`/doc-templates/item/${item.id}`); onChanged(); } catch (err) { notify(err.message, 'error'); }
  };
  const download = (path, name) => downloadAuthenticatedFile(`/api/dkct${path}`, name).catch(err => notify(err.message, 'error'));

  const row = 'flex flex-wrap items-center gap-2 px-3 py-2 border-t border-slate-100 dark:border-slate-800';
  const usingTag = <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">ĐANG DÙNG</span>;
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl" aria-label={kind.label}>
      <header className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <FileText className="w-4 h-4 text-chatlan-600" aria-hidden="true" />
        <h3 className="flex-1 text-sm font-bold text-slate-900 dark:text-white">{kind.label}</h3>
        <span className="text-xs text-slate-500">Đang dùng: <b className="text-slate-800 dark:text-slate-100">{active ? active.name : 'Mẫu gốc'}</b></span>
        {canManage && (
          <label className={`${btnSecondary} cursor-pointer`}>
            <Upload className="w-4 h-4" /> Tải lên mẫu mới
            <input ref={pickNew} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only"
              onChange={e => choose(e.target.files?.[0])} />
          </label>
        )}
      </header>

      {draft && (
        <div className="mx-3 mb-2 p-3 rounded-lg border border-chatlan-200 dark:border-chatlan-800 bg-chatlan-50/50 dark:bg-chatlan-900/20 space-y-2">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-xs text-slate-700 dark:text-slate-200">Mẫu mới: <b>{draft.file.name}</b> ({kb(draft.file.size)})</p>
            <button type="button" className={btnGhost} aria-label="Hủy tải lên" onClick={() => { setDraft(null); if (pickNew.current) pickNew.current.value = ''; }}><X className="w-4 h-4" /></button>
          </div>
          {draft.checking ? <p className="text-xs text-slate-500 inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang kiểm tra mẫu…</p>
            : <CheckReport report={draft.report} errors={draft.errors} />}
          {draft.report && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Tên mẫu
                  <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} className={`${inputCls} ${inputBorder()} block mt-1`} />
                </label>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Ghi chú (đổi gì, áp dụng từ khi nào)
                  <input value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} className={`${inputCls} ${inputBorder()} block mt-1`} />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnSecondary} onClick={() => onPreview(`Mẫu mới — ${kind.label}`, () => api.formBlob(`/doc-templates/${kind.kind}/preview`, formOf(draft.file)))}>
                  <ScanEye className="w-4 h-4" /> Xem thử
                </button>
                <button type="button" className={btnSecondary} onClick={() => save(false)} disabled={!!busy || !draft.name.trim()}><Save className="w-4 h-4" /> Lưu</button>
                <button type="button" className={btnPrimary} onClick={() => save(true)} disabled={!!busy || !draft.name.trim()}>
                  {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Lưu & dùng ngay
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <ul>
        <li className={row}>
          <div className="flex-1 min-w-[14rem]">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">Mẫu gốc {!active && usingTag}</p>
            <p className="text-[11px] text-slate-500">{kind.builtin.fileName} · {kb(kind.builtin.size)} · đi theo phần mềm, không xóa được</p>
          </div>
          <button type="button" className={btnGhost} aria-label="Tải mẫu gốc" title="Tải về để sửa trong Word"
            onClick={() => download(`/doc-templates/${kind.kind}/builtin`, `Mau goc - ${kind.builtin.fileName}`)}><Download className="w-4 h-4" /></button>
          {canManage && active && <button type="button" className={btnSecondary} onClick={() => use(null)}>Dùng mẫu gốc</button>}
        </li>
        {kind.items.map(item => (
          <li key={item.id} className={row}>
            {editing?.id === item.id ? (
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_auto] gap-2 items-end">
                <input aria-label="Tên mẫu" value={editing.name} onChange={e => setEditing(v => ({ ...v, name: e.target.value }))} className={`${inputCls} ${inputBorder()}`} />
                <input aria-label="Ghi chú" placeholder="Ghi chú" value={editing.note} onChange={e => setEditing(v => ({ ...v, note: e.target.value }))} className={`${inputCls} ${inputBorder()}`} />
                <div className="flex gap-1">
                  <button type="button" className={btnPrimary} onClick={saveEdit}><Save className="w-4 h-4" /> Lưu</button>
                  <button type="button" className={btnGhost} aria-label="Hủy" onClick={() => setEditing(null)}><X className="w-4 h-4" /></button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-[14rem]">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">{item.name} {item.active && usingTag}</p>
                  <p className="text-[11px] text-slate-500">{item.fileName} · {kb(item.size)} · {when(item.updatedAt || item.createdAt)}{item.note ? ` · ${item.note}` : ''}</p>
                </div>
                <button type="button" className={btnGhost} aria-label={`Tải mẫu ${item.name}`} title="Tải về"
                  onClick={() => download(`/doc-templates/item/${item.id}/file`, item.fileName || `${item.name}.docx`)}><Download className="w-4 h-4" /></button>
                {canManage && (
                  <>
                    <button type="button" className={btnGhost} aria-label={`Xem thử mẫu ${item.name}`} title="Xem thử (điền văn bản gần nhất)"
                      onClick={() => onPreview(`${item.name} — ${kind.label}`, () => api.blob(`/doc-templates/item/${item.id}/preview`))}><ScanEye className="w-4 h-4" /></button>
                    <button type="button" className={btnGhost} aria-label={`Sửa tên mẫu ${item.name}`} title="Sửa tên, ghi chú"
                      onClick={() => setEditing({ id: item.id, name: item.name, note: item.note || '' })}><Pencil className="w-4 h-4" /></button>
                    <label className={`${btnGhost} cursor-pointer`} title="Thay file (sửa trong Word rồi tải lại)">
                      {busy === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Replace className="w-4 h-4" />}
                      <span className="sr-only">Thay file mẫu {item.name}</span>
                      <input ref={el => { replaceOf.current[item.id] = el; }} type="file" accept=".docx" className="sr-only" onChange={e => replaceFile(item, e.target.files?.[0])} />
                    </label>
                    <button type="button" className={btnGhost} aria-label={`Xóa mẫu ${item.name}`} title="Xóa" onClick={() => remove(item)}><Trash2 className="w-4 h-4 text-red-600" /></button>
                    {!item.active && <button type="button" className={btnSecondary} onClick={() => use(item.id, item.name)}>Dùng mẫu này</button>}
                  </>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800"><TagList tags={kind.builtin.tags} /></div>
    </section>
  );
}

/**
 * Mẫu Word của văn bản xuất ra: tải lên mẫu mới, kiểm tra, xem thử, chọn mẫu đang dùng, sửa, thay file, xóa —
 * đổi mẫu không cần sửa mã. Mọi người xem/tải về; admin thay đổi.
 */
export default function TemplatesPanel({ canManage }) {
  const { api, notify } = useDkct();
  const [kinds, setKinds] = useState(null);
  const [preview, setPreview] = useState(null); // { title, load }
  const load = useCallback(() => api.get('/doc-templates').then(r => setKinds(r.kinds)).catch(err => notify(err.message, 'error')), [api, notify]);
  useEffect(() => { load(); }, [load]);

  if (!kinds) return <Loader2 className="w-5 h-5 animate-spin text-chatlan-600" aria-label="Đang tải" />;
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
        <p>Mẫu Word dùng để xuất biên bản, phương án, giấy đăng ký, giấy xác nhận. Đổi mẫu không cần sửa phần mềm:</p>
        <ol className="list-decimal pl-5 space-y-0.5">
          <li>Tải mẫu đang dùng (hoặc mẫu gốc) về, sửa trong Word — giữ nguyên các thẻ <code>{'{…}'}</code> và nhãn ký số <code>((…))</code>.</li>
          <li>{canManage ? 'Tải lên mẫu mới: phần mềm kiểm tra thẻ và thử điền bằng văn bản gần nhất; bấm Xem thử để xem kết quả.' : 'Admin tải mẫu mới lên, kiểm tra và chọn dùng.'}</li>
          <li>Chọn "Lưu & dùng ngay" hoặc "Dùng mẫu này". Có thể quay về mẫu gốc bất cứ lúc nào.</li>
        </ol>
      </div>
      {kinds.map(k => <KindCard key={k.kind} kind={k} canManage={canManage} onChanged={load} onPreview={(title, fn) => setPreview({ title, load: fn })} />)}
      {preview && (
        <DocPreview title={preview.title} note="Điền bằng văn bản gần nhất (hoặc dữ liệu trống)" load={preview.load} pdf={false}
          onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
