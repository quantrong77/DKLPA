import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Save, Loader2, Plus, Trash2, FileUp, ChevronLeft, ChevronRight, Wand2, Crop, BadgeCheck, History, AlertTriangle, EyeOff } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { Field, Section, btnGhost, btnPrimary, btnSecondary, inputCls, inputBorder } from './ui.jsx';
import { openPdf, renderPdfPage, pageText } from '../lib/pdf.js';
import { patternPoints, parseTitleBlock, drawingRefFor, ROW_PHASES, ROW_TERMINALS, CT_SIDE_PRESETS, parseSide, normalizeSide, sideLabel, INSUFFICIENT } from '../lib/ctLibrary.js';
import { CropView, SourceDialog, RegionPicker } from './CtSource.jsx';

const MAX_PDF = 50 * 1024 * 1024;

const OTHER_SIDE = 'other';

/**
 * Cặp đầu cuộn phía TI có đấu dây: combo box kS1-kS2 … kS1-kS5; chọn "Khác…" để gõ cặp khác (vd kS2-kS3).
 * onChange nhận dạng lưu "S1-S4" khi hợp lệ, còn lại nhận nguyên chữ đang gõ.
 */
export function SideInput({ value, onChange, ariaLabel, className = '' }) {
  const preset = CT_SIDE_PRESETS.includes(normalizeSide(value)) ? normalizeSide(value) : null;
  const [other, setOther] = useState(!preset);
  const [textValue, setText] = useState(preset ? '' : sideLabel(value));
  useEffect(() => {
    if (preset) setOther(false);
    else if (normalizeSide(textValue) !== normalizeSide(value)) { setOther(true); setText(sideLabel(value)); }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const valid = !!parseSide(textValue);
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <select aria-label={ariaLabel} className={`${inputCls} ${inputBorder()} !w-28 !px-1`} value={other ? OTHER_SIDE : preset || OTHER_SIDE}
        onChange={e => {
          if (e.target.value === OTHER_SIDE) { setOther(true); setText(sideLabel(value)); return; }
          setOther(false); onChange(e.target.value);
        }}>
        {CT_SIDE_PRESETS.map(s => <option key={s} value={s}>{sideLabel(s)}</option>)}
        <option value={OTHER_SIDE}>Khác…</option>
      </select>
      {other && (
        <input aria-label={`${ariaLabel} (khác)`} className={`${inputCls} ${inputBorder(!valid)} !w-24`} value={textValue} placeholder="kS2-kS3"
          title={valid ? undefined : 'Ghi cặp đầu cuộn, vd kS2-kS3'}
          onChange={e => { setText(e.target.value); onChange(normalizeSide(e.target.value) || e.target.value); }} />
      )}
    </span>
  );
}

export function StatusBadge({ status }) {
  return status === 'VERIFIED'
    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400"><BadgeCheck className="w-3.5 h-3.5" /> Đã xác nhận</span>
    : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400"><AlertTriangle className="w-3.5 h-3.5" /> Cần kiểm tra</span>;
}

const formOf = (ct) => ({
  substationId: ct.substationId, name: ct.name || '', bay: ct.bay || '', panel: ct.panel || '', drawingNumber: ct.drawingNumber || '', note: ct.note || '',
  cores: ct.cores.map(c => ({ ...c, points: ROW_TERMINALS.map((_, i) => ({ terminal: c.points[i]?.terminal || '', ctTerminal: c.points[i]?.ctTerminal || '' })) }))
});

/**
 * Thêm trang mạch dòng: PDF (chọn trang, đọc khung tên từ lớp chữ) hoặc ảnh chụp/cắt.
 * Chỉ lưu ảnh trang đã chọn, không lưu cả bộ PDF.
 */
function PageAdder({ ct, onAdded, onTitleBlock }) {
  const { api, notify } = useDkct();
  const inputRef = useRef(null);
  const [pdf, setPdf] = useState(null);      // { file, doc, pageCount }
  const [image, setImage] = useState(null);  // { file, url } ảnh chụp
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState(null);
  const [info, setInfo] = useState(null);    // khung tên đọc được
  const [pageLabel, setPageLabel] = useState('');
  const [newRevision, setNewRevision] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => () => { pdf?.doc?.destroy(); }, [pdf]);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => () => { if (image?.url) URL.revokeObjectURL(image.url); }, [image]);

  const showPage = async (doc, n) => {
    setBusy('Đang dựng trang…');
    try {
      const [out, text] = await Promise.all([renderPdfPage(doc, n), pageText(doc, n)]);
      const tb = parseTitleBlock(text);
      setPreview({ ...out, url: URL.createObjectURL(out.blob) });
      setInfo(tb);
      setPageLabel(tb.pageLabel || `${n}/${doc.numPages}`);
      setPage(n);
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(''); }
  };

  const choose = async (file) => {
    if (!file) return;
    setPdf(null); setImage(null); setPreview(null); setInfo(null); setPageLabel('');
    if (/^image\/(png|jpe?g)$/.test(file.type)) {
      setImage({ file, url: URL.createObjectURL(file) });
      return;
    }
    if (file.type && file.type !== 'application/pdf') return notify('Chọn file PDF hoặc ảnh PNG/JPG.', 'error');
    if (file.size > MAX_PDF) return notify('File PDF tối đa 50 MB (chỉ lưu ảnh các trang mạch dòng).', 'error');
    setBusy('Đang mở PDF…');
    try {
      const opened = await openPdf(file);
      setPdf({ file, ...opened });
      await showPage(opened.doc, 1);
    } catch (err) { notify(`Không đọc được PDF: ${err.message}`, 'error'); setBusy(''); }
  };

  const add = async () => {
    setBusy('Đang lưu trang…');
    try {
      const form = new FormData();
      const blob = pdf ? preview.blob : image.file;
      form.append('image', blob, pdf ? `trang-${page}.jpg` : image.file.name);
      form.append('pageLabel', pageLabel.trim());
      form.append('fileName', (pdf || image).file.name);
      if (newRevision) form.append('newRevision', '1');
      const { page: saved } = await api.sendForm(`/ct-library/${ct.id}/pages`, form, 'POST');
      if (info) onTitleBlock(info, saved);
      notify(`Đã thêm trang ${saved.pageLabel || ''}${newRevision ? ' — phiên bản bản vẽ mới, cần kiểm tra lại các core' : ''}.`, 'success');
      setNewRevision(false);
      setImage(null);
      await onAdded(saved);
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(''); }
  };

  const shown = preview?.url || image?.url;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnSecondary} onClick={() => inputRef.current?.click()} disabled={!!busy}>
          <FileUp className="w-4 h-4" /> Chọn PDF / ảnh bản vẽ mạch dòng…
        </button>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf,image/png,image/jpeg" className="hidden"
          onChange={e => { choose(e.target.files?.[0]); e.target.value = ''; }} />
        {pdf && pdf.pageCount > 1 && (
          <div className="flex items-center gap-1" role="group" aria-label="Chọn trang">
            <button type="button" className={btnGhost} aria-label="Trang trước" disabled={page <= 1 || !!busy} onClick={() => showPage(pdf.doc, page - 1)}><ChevronLeft className="w-4 h-4" /></button>
            <input type="number" aria-label="Trang" min={1} max={pdf.pageCount} value={page} className={`${inputCls} ${inputBorder()} !w-20 text-center`}
              onChange={e => { const n = Number(e.target.value); if (n >= 1 && n <= pdf.pageCount) showPage(pdf.doc, n); }} />
            <span className="text-xs text-slate-500">/ {pdf.pageCount}</span>
            <button type="button" className={btnGhost} aria-label="Trang sau" disabled={page >= pdf.pageCount || !!busy} onClick={() => showPage(pdf.doc, page + 1)}><ChevronRight className="w-4 h-4" /></button>
          </div>
        )}
        {busy && <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> {busy}</span>}
      </div>
      {shown && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Số trang bản vẽ" htmlFor="ct-page-label" hint={info?.pageLabel ? 'Đọc từ khung tên.' : 'Không đọc được từ khung tên, ghi tay (vd 115/147).'}>
              <input id="ct-page-label" className={`${inputCls} ${inputBorder()} !w-32`} value={pageLabel} placeholder="115/147" onChange={e => setPageLabel(e.target.value)} />
            </Field>
            <label className="inline-flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 pb-1.5">
              <input type="checkbox" checked={newRevision} onChange={e => setNewRevision(e.target.checked)} />
              Bản vẽ cập nhật (phiên bản mới {ct.revision + 1})
            </label>
            <button type="button" className={btnPrimary} disabled={!!busy} onClick={add}><Plus className="w-4 h-4" /> Thêm trang này</button>
          </div>
          {info && (info.panel || info.drawingNumber) && (
            <p className="text-xs text-slate-500">Khung tên: {[info.drawingNumber, info.panel, info.sheet].filter(Boolean).join(' · ')}. Nhãn hàng kẹp/đầu CT trong mạch là nét vẽ, cần nhập tay theo bản vẽ.</p>
          )}
          <img src={shown} alt="Trang bản vẽ đang chọn" className="w-full h-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white" />
        </>
      )}
    </div>
  );
}

function CoreCard({ core, index, pages, form, issues, readOnly, setCore, removeCore, onPick, onView }) {
  const [side, setSide] = useState('S1-S2');
  const page = pages.find(p => p.id === core.pageId);
  const setPoint = (k, patch) => setCore({ points: core.points.map((p, j) => (j === k ? { ...p, ...patch } : p)) });
  const [from, to] = parseSide(side) || ['S1', 'S2'];
  const fill = () => setCore({ points: patternPoints(core, from, to).map((p, k) => ({
    terminal: core.points[k].terminal || p.terminal, ctTerminal: core.points[k].ctTerminal || p.ctTerminal
  })) });
  const choosePage = (pageId) => {
    const p = pages.find(x => x.id === pageId);
    setCore({ pageId: pageId || null, region: null, drawingRef: core.drawingRef || drawingRefFor(form.panel, p?.pageLabel) });
  };
  const empty = (v) => !String(v || '').trim();
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-[5rem_7rem_1fr_1fr_auto] gap-2 items-end">
        <Field label="Core" htmlFor={`core-no-${index}`}>
          <input id={`core-no-${index}`} type="number" min={1} className={`${inputCls} ${inputBorder(!core.coreNo)}`} value={core.coreNo ?? ''}
            onChange={e => setCore({ coreNo: e.target.value ? Number(e.target.value) : null })} />
        </Field>
        <Field label="Khối hàng kẹp" htmlFor={`core-block-${index}`}>
          <input id={`core-block-${index}`} className={`${inputCls} ${inputBorder(empty(core.terminalBlock))}`} value={core.terminalBlock} placeholder="X41"
            onChange={e => setCore({ terminalBlock: e.target.value })} />
        </Field>
        <Field label="Trang nguồn" htmlFor={`core-page-${index}`}>
          <select id={`core-page-${index}`} className={`${inputCls} ${inputBorder()}`} value={core.pageId || ''} onChange={e => choosePage(e.target.value)}>
            <option value="">— Chưa chọn —</option>
            {pages.map(p => <option key={p.id} value={p.id}>Trang {p.pageLabel || '?'} · phiên bản {p.revision}</option>)}
          </select>
        </Field>
        <Field label="Tham chiếu bản vẽ" htmlFor={`core-ref-${index}`}>
          <input id={`core-ref-${index}`} className={`${inputCls} ${inputBorder()}`} value={core.drawingRef} placeholder="=D02+MK202/115"
            onChange={e => setCore({ drawingRef: e.target.value })} />
        </Field>
        {!readOnly && <button type="button" className={btnGhost} aria-label={`Xóa core ${core.coreNo ?? index + 1}`} onClick={removeCore}><Trash2 className="w-4 h-4" /></button>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_16rem] gap-3">
        <table className="w-full text-sm">
          <thead className="text-xs text-left text-slate-600 dark:text-slate-300">
            <tr><th className="p-1 w-12">Pha</th><th className="p-1">Hàng kẹp (tủ trung gian)</th><th className="p-1">Đầu phía CT</th></tr>
          </thead>
          <tbody>
            {core.points.map((p, k) => (
              <tr key={k}>
                <td className="p-1 font-semibold text-slate-700 dark:text-slate-200">{ROW_PHASES[k]}</td>
                <td className="p-1">
                  <input aria-label={`Core ${core.coreNo ?? index + 1} ${ROW_PHASES[k]} hàng kẹp dòng ${k + 1}`} className={`${inputCls} ${inputBorder(empty(p.terminal))}`}
                    value={p.terminal} placeholder={INSUFFICIENT} onChange={e => setPoint(k, { terminal: e.target.value })} />
                </td>
                <td className="p-1">
                  <input aria-label={`Core ${core.coreNo ?? index + 1} ${ROW_PHASES[k]} đầu CT dòng ${k + 1}`} className={`${inputCls} ${inputBorder(empty(p.ctTerminal))}`}
                    value={p.ctTerminal} placeholder={INSUFFICIENT} onChange={e => setPoint(k, { ctTerminal: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-2">
          {core.pageId ? (
            <button type="button" className="block w-full text-left" onClick={onView} title="Xem lại mạch dòng của core">
              <CropView pageId={core.pageId} region={core.region} alt={`Mạch dòng core ${core.coreNo ?? ''}`} className="rounded-lg border border-slate-200 dark:border-slate-700 max-h-64" />
            </button>
          ) : <p className="text-xs text-slate-500">Chọn trang nguồn để khoanh vùng mạch của core.</p>}
          {!readOnly && (
            <div className="flex flex-wrap gap-1.5">
              {core.pageId && <button type="button" className={btnSecondary} onClick={onPick}><Crop className="w-4 h-4" /> {core.region ? 'Khoanh lại' : 'Khoanh vùng'}</button>}
              <div className="inline-flex items-center gap-1">
                <SideInput ariaLabel={`Đầu phía TI core ${core.coreNo ?? index + 1}`} value={side} onChange={setSide} />
                <button type="button" className={btnSecondary} onClick={fill} title="Chỉ điền ô trống; đối chiếu lại với bản vẽ"><Wand2 className="w-4 h-4" /> Điền theo mẫu</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {issues.length > 0 && (
        <ul className="text-xs space-y-0.5">
          {issues.map((i, k) => <li key={k} className={i.level === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}>{i.message}</li>)}
        </ul>
      )}
    </div>
  );
}

/** Đầu phía TI cho nhiều core: tick các core, chọn cặp đầu cuộn, áp dụng (ghi đè cột "Đầu phía CT" của các core đó). */
function SideApplier({ cores, onApply }) {
  const [side, setSide] = useState('S1-S2');
  const [picked, setPicked] = useState(() => cores.map((_, i) => i));
  const pair = parseSide(side);
  const toggle = (i) => setPicked(l => (l.includes(i) ? l.filter(x => x !== i) : [...l, i]));
  return (
    <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-slate-100 dark:bg-slate-800/60 text-sm">
      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Đầu phía TI</span>
      <SideInput ariaLabel="Đầu phía TI cho các core đã tick" value={side} onChange={setSide} />
      <span className="text-xs text-slate-500">cho core:</span>
      {cores.map((c, i) => (
        <label key={c.id || i} className="inline-flex items-center gap-1 text-xs text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={picked.includes(i)} onChange={() => toggle(i)} /> {c.coreNo ?? `#${i + 1}`}
        </label>
      ))}
      <button type="button" className={btnSecondary} disabled={!pair || !picked.length} onClick={() => onApply(picked, pair)}
        title="Ghi đè cột Đầu phía CT của các core đã tick; core khác đầu thì bỏ tick, chọn cặp khác rồi áp dụng tiếp">
        <Wand2 className="w-4 h-4" /> Áp dụng
      </button>
    </div>
  );
}

function AuditDialog({ ctId, onClose }) {
  const { api, notify, ModalOverlay } = useDkct();
  const [items, setItems] = useState(null);
  useEffect(() => { api.get(`/ct-library/${ctId}/audit`).then(r => setItems(r.items)).catch(err => notify(err.message, 'error')); }, [api, ctId, notify]);
  const ACTIONS = { CREATE: 'Tạo', UPDATE: 'Sửa', VERIFY: 'Xác nhận', REVISION: 'Bản vẽ cập nhật', ADD_PAGE: 'Thêm trang', DELETE_PAGE: 'Xóa trang', HIDE: 'Ẩn' };
  const line = (c) => (c.change ? `Core ${c.core}: ${c.change === 'ADDED' ? 'thêm' : 'bỏ'}`
    : `Core ${c.core}${c.phase ? ` ${c.phase} (dòng ${c.seq})` : ''} ${c.field}: ${typeof c.from === 'object' ? 'vùng' : c.from || '—'} → ${typeof c.to === 'object' ? 'vùng mới' : c.to || '—'}`);
  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-xl flex flex-col max-h-[85vh]">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Nhật ký thay đổi</h2>
          <button type="button" className={btnGhost} aria-label="Đóng" onClick={onClose}><X className="w-5 h-5" /></button>
        </header>
        <div className="overflow-y-auto p-4 space-y-3 text-sm">
          {!items ? <Loader2 className="w-5 h-5 animate-spin text-slate-500" /> : items.map(a => (
            <div key={a.id}>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{a.createdAt} · {ACTIONS[a.action] || a.action}{a.pageLabel ? ` ${a.pageLabel}` : ''}</p>
              <ul className="text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
                {(a.fields || []).map((f, k) => <li key={`f${k}`}>{f.field}: {f.from || '—'} → {f.to || '—'}</li>)}
                {a.changes.map((c, k) => <li key={k}>{line(c)}</li>)}
                {a.reordered && <li>Đổi thứ tự core</li>}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </ModalOverlay>
  );
}

/** Sửa một biến dòng của thư viện: trang mạch dòng, các core (6 điểm mỗi core), xác nhận. */
export default function CtEditor({ ctId, catalogs, canManage, onClose, onChanged }) {
  const { api, notify, confirmAction, ModalOverlay } = useDkct();
  const [ct, setCt] = useState(null);
  const [form, setForm] = useState(null);
  const [issues, setIssues] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(null); // chỉ số core đang khoanh vùng
  const [viewing, setViewing] = useState(null); // chỉ số core đang xem nguồn
  const [showAudit, setShowAudit] = useState(false);
  const readOnly = !canManage;

  const apply = ({ ct: next, issues: list }, keepForm = false) => {
    setCt(next);
    setIssues(list);
    if (!keepForm) { setForm(formOf(next)); setDirty(false); }
  };
  useEffect(() => { api.get(`/ct-library/${ctId}`).then(r => apply(r)).catch(err => notify(err.message, 'error')); }, [api, ctId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = useMemo(() => (ct?.pages || []).slice().sort((a, b) => b.revision - a.revision), [ct]);
  if (!ct || !form) {
    return (
      <ModalOverlay onClose={onClose} className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4"><h2 className="sr-only">Đang tải</h2><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
      </ModalOverlay>
    );
  }

  const update = (patch) => { setDirty(true); setForm(f => ({ ...f, ...(typeof patch === 'function' ? patch(f) : patch) })); };
  const setCore = (i, patch) => update(f => ({ cores: f.cores.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const addCore = () => update(f => {
    const no = Math.max(0, ...f.cores.map(c => c.coreNo || 0)) + 1;
    return { cores: [...f.cores, { id: null, coreNo: no, terminalBlock: '', drawingRef: '', spec: '', pageId: null, region: null, points: ROW_TERMINALS.map(() => ({ terminal: '', ctTerminal: '' })) }] };
  });

  const save = async () => {
    setBusy(true);
    try {
      apply(await api.put(`/ct-library/${ct.id}`, form));
      notify('Đã lưu biến dòng.', 'success');
      onChanged();
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  };
  const verify = async () => {
    if (!(await confirmAction({ title: `Xác nhận ${ct.name}?`, message: 'Xác nhận đã đối chiếu từng core với bản vẽ mạch dòng. Phương án chọn TI này sẽ in bản chính thức (không còn ghi "bản nháp").' }))) return;
    setBusy(true);
    try {
      apply(await api.post(`/ct-library/${ct.id}/verify`));
      notify(`Đã xác nhận ${ct.name}.`, 'success');
      onChanged();
    } catch (err) {
      if (err.status === 422) api.get(`/ct-library/${ct.id}`).then(r => setIssues(r.issues)).catch(() => {});
      notify(err.message, 'error');
    } finally { setBusy(false); }
  };
  const hide = async () => {
    if (!(await confirmAction({ title: `Ẩn ${ct.name} khỏi thư viện?`, message: 'Phương án đã lập vẫn giữ bảng đã chọn.', danger: true }))) return;
    try { await api.del(`/ct-library/${ct.id}`); onChanged(); onClose(); } catch (err) { notify(err.message, 'error'); }
  };
  const close = async () => {
    if (dirty && !(await confirmAction({ title: 'Đóng khi chưa lưu?', message: 'Các thay đổi chưa lưu sẽ bị hủy.', confirmLabel: 'Đóng, không lưu' }))) return;
    onClose();
  };
  // khung tên đọc từ PDF: chỉ điền các ô còn trống
  const onTitleBlock = (tb) => update(f => ({
    panel: f.panel || tb.panel, drawingNumber: f.drawingNumber || tb.drawingNumber, bay: f.bay || tb.bay
  }));
  const onPageAdded = async () => {
    const fresh = await api.get(`/ct-library/${ct.id}`);
    apply(fresh, true); // giữ phần đang sửa dở
    onChanged();
  };
  const deletePage = async (p) => {
    if (!(await confirmAction({ title: `Xóa trang ${p.pageLabel || ''}?`, danger: true }))) return;
    try { await api.del(`/ct-pages/${p.id}`); await onPageAdded(); } catch (err) { notify(err.message, 'error'); }
  };

  const errorCount = issues.filter(i => i.level === 'error').length;
  const core = picking !== null ? form.cores[picking] : viewing !== null ? form.cores[viewing] : null;
  return (
    <ModalOverlay onClose={close} className="fixed inset-0 z-50 bg-slate-900/40 flex items-stretch md:items-center justify-center md:p-4">
      <div className="bg-slate-50 dark:bg-slate-950 w-full md:max-w-6xl md:rounded-2xl shadow-xl flex flex-col max-h-full md:max-h-[94vh]">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">{ct.name} — {ct.substationName}</h2>
            <p className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
              <StatusBadge status={dirty ? 'DRAFT' : ct.status} /> Phiên bản bản vẽ {ct.revision}
              {ct.status === 'VERIFIED' && ct.verifiedAt && !dirty && <span>· xác nhận {ct.verifiedAt.replace('T', ' ')}</span>}
              {readOnly && <span>· Chỉ xem (admin sửa)</span>}
            </p>
          </div>
          <button type="button" className={btnGhost} aria-label="Đóng" onClick={close}><X className="w-5 h-5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          <fieldset disabled={readOnly || busy} className="space-y-4 min-w-0">
            <Section title="Biến dòng">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Trạm biến áp" htmlFor="ct-sub">
                  <select id="ct-sub" className={`${inputCls} ${inputBorder()}`} value={form.substationId} onChange={e => update({ substationId: e.target.value })}>
                    {(catalogs.substations || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </Field>
                <Field label="Tên biến dòng" htmlFor="ct-name" required><input id="ct-name" className={`${inputCls} ${inputBorder(!form.name)}`} value={form.name} placeholder="TI 272" onChange={e => update({ name: e.target.value })} /></Field>
                <Field label="Ngăn lộ" htmlFor="ct-bay"><input id="ct-bay" className={`${inputCls} ${inputBorder()}`} value={form.bay} placeholder="272" onChange={e => update({ bay: e.target.value })} /></Field>
                <Field label="Tủ trung gian" htmlFor="ct-panel" hint='In "Tại tủ …" ở Phụ lục II.'><input id="ct-panel" className={`${inputCls} ${inputBorder()}`} value={form.panel} placeholder="=D02+MK202" onChange={e => update({ panel: e.target.value })} /></Field>
                <Field label="Số bản vẽ" htmlFor="ct-dwg"><input id="ct-dwg" className={`${inputCls} ${inputBorder()}`} value={form.drawingNumber} placeholder="220PHANRI/12.6.2026/D02-272" onChange={e => update({ drawingNumber: e.target.value })} /></Field>
                <Field label="Ghi chú" htmlFor="ct-note"><input id="ct-note" className={`${inputCls} ${inputBorder()}`} value={form.note} onChange={e => update({ note: e.target.value })} /></Field>
              </div>
            </Section>
            <Section title="Trang bản vẽ mạch dòng" subtitle="Chỉ lưu ảnh các trang mạch dòng. Bản vẽ cập nhật: thêm trang mới và tick “Bản vẽ cập nhật”; trang cũ giữ lại cho phương án đã lập.">
              {pages.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pages.map(p => (
                    <span key={p.id} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs ${p.revision === ct.revision ? 'border-chatlan-200 bg-chatlan-50 dark:bg-chatlan-900/40 dark:border-chatlan-900' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                      Trang {p.pageLabel || '?'} · phiên bản {p.revision}
                      {!readOnly && <button type="button" className="p-0.5 hover:text-red-600" aria-label={`Xóa trang ${p.pageLabel}`} onClick={() => deletePage(p)}><X className="w-3.5 h-3.5" /></button>}
                    </span>
                  ))}
                </div>
              )}
              {!readOnly && <PageAdder ct={ct} onAdded={onPageAdded} onTitleBlock={onTitleBlock} />}
            </Section>
            <Section title={`Các core (${form.cores.length})`}
              subtitle="Mỗi core 6 dòng: L1 kẹp 1, 4; L2 kẹp 2, 5; L3 kẹp 3, 6 tại tủ trung gian. Đầu phía CT ghi đúng nhãn trên bản vẽ (đầu cuộn có đấu dây). Ô trống in “CHƯA ĐỦ DỮ LIỆU”."
              actions={!readOnly && <button type="button" className={btnSecondary} onClick={addCore}><Plus className="w-4 h-4" /> Thêm core</button>}>
              {!readOnly && form.cores.length > 0 && <SideApplier cores={form.cores} onApply={(picked, pair) => update(f => ({
                cores: f.cores.map((c, i) => (picked.includes(i) ? { ...c, points: c.points.map((p, k) => ({ ...p, ctTerminal: c.coreNo ? `${c.coreNo}${pair[k % 2]}` : p.ctTerminal })) } : c))
              }))} />}
              {form.cores.map((c, i) => (
                <CoreCard key={c.id || `new-${i}`} core={c} index={i} pages={pages} form={form} readOnly={readOnly}
                  issues={dirty ? [] : issues.filter(x => x.core === i)}
                  setCore={patch => setCore(i, patch)} removeCore={() => update(f => ({ cores: f.cores.filter((_, j) => j !== i) }))}
                  onPick={() => setPicking(i)} onView={() => setViewing(i)} />
              ))}
            </Section>
          </fieldset>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:rounded-b-2xl">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} onClick={() => setShowAudit(true)}><History className="w-4 h-4" /> Nhật ký</button>
            {!readOnly && <button type="button" className={btnSecondary} onClick={hide}><EyeOff className="w-4 h-4" /> Ẩn TI</button>}
          </div>
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-2">
              {!dirty && errorCount > 0 && <span className="text-xs text-red-600">{errorCount} mục cần bổ sung trước khi xác nhận</span>}
              <button type="button" className={btnSecondary} onClick={verify} disabled={busy || dirty || ct.status === 'VERIFIED'} title={dirty ? 'Lưu trước khi xác nhận' : undefined}>
                <BadgeCheck className="w-4 h-4" /> Xác nhận
              </button>
              <button type="button" className={btnPrimary} onClick={save} disabled={busy || !dirty}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu
              </button>
            </div>
          )}
        </footer>
      </div>
      {picking !== null && core && (
        <RegionPicker title={`Khoanh vùng core ${core.coreNo ?? picking + 1}`} pageId={core.pageId} region={core.region}
          onClose={() => setPicking(null)} onSave={region => { setCore(picking, { region }); setPicking(null); }} />
      )}
      {viewing !== null && core && (
        <SourceDialog title={`${form.name} — core ${core.coreNo ?? viewing + 1}`} subtitle={core.drawingRef} pageId={core.pageId} region={core.region} onClose={() => setViewing(null)} />
      )}
      {showAudit && <AuditDialog ctId={ct.id} onClose={() => setShowAudit(false)} />}
    </ModalOverlay>
  );
}
