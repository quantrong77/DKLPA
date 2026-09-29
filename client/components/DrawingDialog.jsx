import React, { useEffect, useRef, useState } from 'react';
import { X, FileUp, Loader2, ChevronLeft, ChevronRight, Save, Trash2, ExternalLink, Plus } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { TabButton, btnGhost, btnPrimary, btnSecondary, inputCls, inputBorder } from './ui.jsx';
import { openPdf, renderPdfPage } from '../lib/pdf.js';

const MAX_PDF = 20 * 1024 * 1024;
const LABEL_SUGGESTIONS = ['Sơ đồ trạm', 'Phía 500kV', 'Phía 220kV', 'Phía 110kV'];

/** Mở PDF bản vẽ đã lưu ở tab mới (tải kèm xác thực). */
export async function openDrawingPdf(api, drawingId) {
  const win = window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await api.blob(`/drawings/${drawingId}/pdf`));
    if (win) win.location.href = url; else window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    if (win) win.close();
    throw err;
  }
}

/** Tên gợi ý cho sơ đồ mới: TBA 500kV có sơ đồ phía 500kV và phía 220kV. */
function nextLabel(substation, drawings) {
  const used = new Set(drawings.map(d => d.label.toLocaleLowerCase('vi')));
  const wanted = /500\s*kV/i.test(substation.name) ? ['Phía 500kV', 'Phía 220kV'] : ['Sơ đồ trạm'];
  return wanted.find(l => !used.has(l.toLocaleLowerCase('vi'))) || '';
}

/**
 * Các bản vẽ sơ đồ của một trạm (TBA 500kV thường có hai: phía 500kV, phía 220kV).
 * Xem từng sơ đồ; người quản lý danh mục thêm sơ đồ (PDF, chọn trang), đổi tên, thay PDF hoặc xóa.
 * drawings: thông tin các sơ đồ đang lưu của trạm, theo thứ tự in.
 */
export default function DrawingDialog({ substation, drawings, canManage, onClose, onChanged }) {
  const { api, notify, confirmAction, ModalOverlay } = useDkct();
  const inputRef = useRef(null);
  // sơ đồ đang xem: id, hoặc 'new' khi thêm sơ đồ
  const [selected, setSelected] = useState(drawings[0]?.id || (canManage ? 'new' : null));
  const drawing = drawings.find(d => d.id === selected) || null;
  const [label, setLabel] = useState(drawing?.label ?? nextLabel(substation, drawings));
  const [current, setCurrent] = useState(null); // ảnh sơ đồ đang lưu
  const [pdf, setPdf] = useState(null);         // { file, doc, pageCount }
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState(null); // { blob, url, width, height }
  const [busy, setBusy] = useState('');

  // đổi sơ đồ đang xem: bỏ PDF đang chọn dở, nạp ảnh sơ đồ đã lưu
  useEffect(() => {
    setPdf(null);
    setPreview(null);
    setCurrent(null);
    setLabel(drawing?.label ?? nextLabel(substation, drawings));
    if (!drawing) return undefined;
    let url = null;
    let alive = true;
    api.blob(`/drawings/${drawing.id}/image`)
      .then(b => { url = URL.createObjectURL(b); if (alive) setCurrent(url); else URL.revokeObjectURL(url); })
      .catch(() => notify('Không tải được ảnh bản vẽ.', 'warning'));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [selected, drawing?.updatedAt, drawing?.pdfSize, drawing?.page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { pdf?.doc?.destroy(); }, [pdf]);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  const renderPage = async (doc, n) => {
    setBusy('Đang dựng trang…');
    try {
      const out = await renderPdfPage(doc, n);
      setPreview({ ...out, url: URL.createObjectURL(out.blob) });
      setPage(n);
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(''); }
  };

  const choose = async (file) => {
    if (!file) return;
    if (file.type && file.type !== 'application/pdf') return notify('Chọn file PDF.', 'error');
    if (file.size > MAX_PDF) return notify('File bản vẽ tối đa 20 MB.', 'error');
    setBusy('Đang mở PDF…');
    try {
      const opened = await openPdf(file);
      setPdf({ file, ...opened });
      await renderPage(opened.doc, 1);
    } catch (err) {
      notify(`Không đọc được file PDF: ${err.message}`, 'error');
      setBusy('');
    }
  };

  const save = async () => {
    if (!label.trim()) return notify('Đặt tên sơ đồ (vd "Phía 500kV").', 'error');
    setBusy('Đang lưu…');
    try {
      const form = new FormData();
      form.append('label', label.trim());
      if (pdf) {
        form.append('pdf', pdf.file, pdf.file.name);
        form.append('image', preview.blob, `trang-${page}.jpg`);
        form.append('page', String(page));
        form.append('pageCount', String(pdf.pageCount));
      }
      const res = drawing
        ? await api.sendForm(`/drawings/${drawing.id}`, form)
        : await api.sendForm(`/substations/${substation.id}/drawings`, form, 'POST');
      notify(`Đã lưu sơ đồ "${res.drawing.label}" của ${substation.name}.`, 'success');
      await onChanged();
      setSelected(res.drawing.id);
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(''); }
  };

  const remove = async () => {
    if (!(await confirmAction({ title: `Xóa sơ đồ "${drawing.label}"?`, message: `${substation.name}: biên bản đã lập vẫn giữ sơ đồ đã dùng; phương án sẽ không còn in sơ đồ này.`, danger: true }))) return;
    try {
      await api.del(`/drawings/${drawing.id}`);
      await onChanged();
      setSelected(drawings.find(d => d.id !== drawing.id)?.id || (canManage ? 'new' : null));
    } catch (err) { notify(err.message, 'error'); }
  };

  const shown = preview?.url || current;
  const labelChanged = drawing && label.trim() && label.trim() !== drawing.label;
  const canSave = canManage && !busy && (drawing ? (pdf ? !!preview : labelChanged) : !!(pdf && preview));
  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-50 bg-slate-900/40 flex items-stretch md:items-center justify-center md:p-4">
      <div className="bg-white dark:bg-slate-900 w-full md:max-w-5xl md:rounded-2xl shadow-xl flex flex-col max-h-full md:max-h-[92vh]">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">Bản vẽ sơ đồ — {substation.name}</h2>
            <p className="text-xs text-slate-500">
              {pdf ? `${pdf.file.name} · trang ${page}/${pdf.pageCount}` : drawing ? `${drawing.fileName} · trang ${drawing.page}/${drawing.pageCount}` : drawings.length ? 'Thêm sơ đồ' : 'Chưa có bản vẽ'}
            </p>
          </div>
          <button type="button" className={btnGhost} aria-label="Đóng" onClick={onClose}><X className="w-5 h-5" /></button>
        </header>
        {(drawings.length > 0 || canManage) && (
          <nav className="flex gap-2 px-4 py-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto" aria-label="Các sơ đồ của trạm">
            {drawings.map(d => <TabButton key={d.id} active={selected === d.id} onClick={() => setSelected(d.id)}>{d.label}</TabButton>)}
            {canManage && <TabButton icon={Plus} active={selected === 'new'} onClick={() => setSelected('new')}>Thêm sơ đồ</TabButton>}
          </nav>
        )}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {canManage && selected && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Tên sơ đồ
                <input list="dkct-drawing-labels" className={`${inputCls} ${inputBorder()} !w-48 mt-1 font-normal`} value={label}
                  placeholder="Phía 500kV" maxLength={100} onChange={e => setLabel(e.target.value)} />
              </label>
              <datalist id="dkct-drawing-labels">{LABEL_SUGGESTIONS.map(l => <option key={l} value={l} />)}</datalist>
              <button type="button" className={btnSecondary} onClick={() => inputRef.current?.click()} disabled={!!busy}>
                <FileUp className="w-4 h-4" /> {drawing || pdf ? 'Chọn PDF khác…' : 'Chọn file PDF…'}
              </button>
              <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden"
                onChange={e => { choose(e.target.files?.[0]); e.target.value = ''; }} />
              {pdf && pdf.pageCount > 1 && (
                <div className="flex items-center gap-1" role="group" aria-label="Chọn trang">
                  <button type="button" className={btnGhost} aria-label="Trang trước" disabled={page <= 1 || !!busy} onClick={() => renderPage(pdf.doc, page - 1)}><ChevronLeft className="w-4 h-4" /></button>
                  <input type="number" aria-label="Trang" min={1} max={pdf.pageCount} value={page} className={`${inputCls} ${inputBorder()} !w-16 text-center`}
                    onChange={e => { const n = Number(e.target.value); if (n >= 1 && n <= pdf.pageCount) renderPage(pdf.doc, n); }} />
                  <span className="text-xs text-slate-500">/ {pdf.pageCount}</span>
                  <button type="button" className={btnGhost} aria-label="Trang sau" disabled={page >= pdf.pageCount || !!busy} onClick={() => renderPage(pdf.doc, page + 1)}><ChevronRight className="w-4 h-4" /></button>
                </div>
              )}
              {busy && <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> {busy}</span>}
            </div>
          )}
          {canManage && selected === 'new' && !pdf && (
            <p className="text-xs text-slate-500">
              TBA 500kV: thêm hai sơ đồ "Phía 500kV" và "Phía 220kV" (có thể cùng một file PDF, khác trang). Phương án chọn in một hoặc cả hai sơ đồ.
            </p>
          )}
          {pdf && <p className="text-xs text-slate-500">Chọn trang có sơ đồ một sợi; trang này được chèn vào biên bản khảo sát và Phụ lục IV của phương án.</p>}
          {shown
            ? <img src={shown} alt={`Bản vẽ ${substation.name}${drawing ? ` — ${drawing.label}` : ''}`} className="w-full h-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white" />
            : <p className="text-sm text-slate-500">{canManage ? 'Chọn file PDF bản vẽ sơ đồ của trạm.' : 'Trạm này chưa có bản vẽ.'}</p>}
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800">
          {drawing && !pdf && (
            <button type="button" className={btnSecondary} onClick={() => openDrawingPdf(api, drawing.id).catch(e => notify(e.message, 'error'))}>
              <ExternalLink className="w-4 h-4" /> Mở PDF gốc
            </button>
          )}
          {canManage && drawing && !pdf && (
            <button type="button" className={btnSecondary} onClick={remove}><Trash2 className="w-4 h-4" /> Xóa sơ đồ</button>
          )}
          {canManage && selected && (
            <button type="button" className={btnPrimary} onClick={save} disabled={!canSave}>
              <Save className="w-4 h-4" /> {pdf ? `Lưu sơ đồ (trang ${page})` : drawing ? 'Lưu tên' : 'Lưu sơ đồ'}
            </button>
          )}
        </footer>
      </div>
    </ModalOverlay>
  );
}
